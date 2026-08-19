import asyncio
import base64
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2
import pandas as pd

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect
)

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import FileResponse

from ultralytics import YOLO

from backend.alarm_manager import alarm_manager

from backend.database import (
    initialize_database,
    add_violation,
    get_all_violations,
    get_total_violations,
    get_workers_involved,
    get_latest_violation,
    export_to_excel
)


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(
    __file__
).resolve().parents[1]

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "best.pt"
)


# ============================================================
# DATABASE
# ============================================================

initialize_database()


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Industrial PPE Monitoring API",
    version="3.0.0",
    description=(
        "Real-time Industrial PPE Monitoring "
        "with YOLO, worker tracking, alarms, "
        "database logging and Excel export."
    )
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]
)


# ============================================================
# YOLO MODEL
# ============================================================

print("=" * 50)
print("Loading YOLO model...")
print("=" * 50)

model = YOLO(
    str(MODEL_PATH)
)

print("YOLO model loaded successfully.")
print("Classes:", model.names)


# ============================================================
# MODEL CLASSES
# ============================================================

PERSON_CLASS = "Person"

PPE_CLASSES = {
    "helmet",
    "gloves",
    "vest",
    "boots",
    "goggles"
}


VIOLATION_CLASSES = {

    "no_helmet":
        "Helmet",

    "no_goggle":
        "Safety Goggles",

    "no_gloves":
        "Gloves",

    "no_boots":
        "Safety Boots"
}


# ============================================================
# REQUIRED PPE
# ============================================================

REQUIRED_PPE = {

    "helmet":
        "Helmet",

    "gloves":
        "Gloves",

    "vest":
        "Safety Vest",

    "boots":
        "Safety Boots",

    "goggles":
        "Safety Goggles"
}


# ============================================================
# SYSTEM STATE
# ============================================================

system_state = {

    "monitoring":
        False,

    "alarm":
        False,

    "workers":
        0,

    "compliant":
        0,

    "violating":
        0,

    "missing_ppe":
        0,

    "last_update":
        None
}


# ============================================================
# CAMERA STATE
# ============================================================

camera = None

monitoring_thread = None

stop_event = threading.Event()

state_lock = threading.Lock()


# ============================================================
# WEBSOCKET STATE
# ============================================================

connected_clients = set()


# ============================================================
# FRAME STATE
# ============================================================

latest_frame = None

latest_frame_lock = threading.Lock()


# ============================================================
# VIOLATION COOLDOWN
# ============================================================

last_logged = {}

VIOLATION_COOLDOWN = 5


# ============================================================
# IOU
# ============================================================

def calculate_iou(
    box_a,
    box_b
):

    ax1, ay1, ax2, ay2 = box_a

    bx1, by1, bx2, by2 = box_b


    intersection_x1 = max(
        ax1,
        bx1
    )

    intersection_y1 = max(
        ay1,
        by1
    )

    intersection_x2 = min(
        ax2,
        bx2
    )

    intersection_y2 = min(
        ay2,
        by2
    )


    width = max(
        0,
        intersection_x2
        - intersection_x1
    )

    height = max(
        0,
        intersection_y2
        - intersection_y1
    )


    intersection_area = (
        width * height
    )


    area_a = (
        max(
            0,
            ax2 - ax1
        )
        *
        max(
            0,
            ay2 - ay1
        )
    )


    area_b = (
        max(
            0,
            bx2 - bx1
        )
        *
        max(
            0,
            by2 - by1
        )
    )


    union = (
        area_a
        +
        area_b
        -
        intersection_area
    )


    if union <= 0:

        return 0


    return (
        intersection_area
        /
        union
    )


# ============================================================
# BOX CENTER
# ============================================================

def box_center(box):

    x1, y1, x2, y2 = box

    return (

        (x1 + x2) / 2,

        (y1 + y2) / 2

    )


# ============================================================
# POINT INSIDE BOX
# ============================================================

def point_inside_box(
    point,
    box
):

    x, y = point

    x1, y1, x2, y2 = box

    return (

        x1 <= x <= x2

        and

        y1 <= y <= y2

    )


# ============================================================
# ASSIGN PPE TO PERSON
# ============================================================

def assign_ppe_to_person(
    ppe_box,
    persons
):

    center = box_center(
        ppe_box
    )

    best_person = None

    best_score = 0


    for person in persons:

        person_box = (
            person["box"]
        )


        if point_inside_box(
            center,
            person_box
        ):

            score = 1.0


        else:

            score = calculate_iou(
                ppe_box,
                person_box
            )


        if score > best_score:

            best_score = score

            best_person = person


    return best_person


# ============================================================
# DATABASE VIOLATION LOGGER
# ============================================================

def log_violation(
    person_id,
    missing_ppe
):

    current_time = time.time()


    key = (

        person_id,

        tuple(
            sorted(
                missing_ppe
            )
        )

    )


    previous_time = (
        last_logged.get(
            key,
            0
        )
    )


    if (
        current_time
        -
        previous_time
        <
        VIOLATION_COOLDOWN
    ):

        return


    last_logged[
        key
    ] = current_time


    try:

        add_violation(

            person_id,

            missing_ppe

        )


        print(
            "VIOLATION STORED:",
            person_id,
            sorted(
                missing_ppe
            )
        )


    except Exception as error:

        print(
            "Database logging error:",
            error
        )


# ============================================================
# PROCESS FRAME
# ============================================================

def process_frame(
    frame
):

    global latest_frame


    # ========================================================
    # YOLO TRACKING
    # ========================================================

    results = model.track(

        source=frame,

        conf=0.40,

        persist=True,

        tracker="bytetrack.yaml",

        device="cpu",

        verbose=False

    )


    result = results[0]


    persons = []

    ppe_detections = []


    # ========================================================
    # READ DETECTIONS
    # ========================================================

    if result.boxes is not None:

        boxes = result.boxes


        for index in range(
            len(boxes)
        ):


            class_id = int(
                boxes.cls[
                    index
                ]
            )


            class_name = (
                model.names[
                    class_id
                ]
            )


            xyxy = (

                boxes.xyxy[
                    index
                ]

                .cpu()

                .numpy()

            )


            x1, y1, x2, y2 = map(
                int,
                xyxy
            )


            detection_box = [

                x1,
                y1,
                x2,
                y2

            ]


            # =================================================
            # PERSON
            # =================================================

            if (
                class_name
                ==
                PERSON_CLASS
            ):


                track_id = None


                if (
                    boxes.id
                    is not None
                ):

                    track_id = int(

                        boxes.id[
                            index
                        ]

                    )


                if track_id is None:

                    track_id = 0


                persons.append({

                    "id":
                        track_id,

                    "box":
                        detection_box,

                    "ppe":
                        set(),

                    "violations":
                        set()

                })


            # =================================================
            # NORMAL PPE
            # =================================================

            elif (
                class_name
                in
                PPE_CLASSES
            ):

                ppe_detections.append({

                    "class":
                        class_name,

                    "box":
                        detection_box

                })


            # =================================================
            # EXPLICIT VIOLATION
            # =================================================

            elif (
                class_name
                in
                VIOLATION_CLASSES
            ):

                ppe_detections.append({

                    "class":
                        class_name,

                    "box":
                        detection_box

                })


    # ========================================================
    # ASSOCIATE PPE WITH PERSON
    # ========================================================

    for detection in ppe_detections:


        person = assign_ppe_to_person(

            detection["box"],

            persons

        )


        if person is None:

            continue


        class_name = (
            detection["class"]
        )


        if (
            class_name
            in
            PPE_CLASSES
        ):

            person[
                "ppe"
            ].add(
                class_name
            )


        elif (
            class_name
            in
            VIOLATION_CLASSES
        ):

            person[
                "violations"
            ].add(

                VIOLATION_CLASSES[
                    class_name
                ]

            )


    # ========================================================
    # STATISTICS
    # ========================================================

    compliant_people = 0

    violating_people = 0

    total_missing = 0

    violation_messages = []


    # ========================================================
    # DRAW WORKERS
    # ========================================================

    for person in persons:


        person_id = (
            person["id"]
        )


        detected_ppe = (
            person["ppe"]
        )


        explicit_violations = (
            person["violations"]
        )


        # ====================================================
        # MISSING PPE
        # ====================================================

        missing_ppe = set()


        for item, display_name in (
            REQUIRED_PPE.items()
        ):


            # ------------------------------------------------
            # No no_vest class exists in your model.
            #
            # Therefore absence of vest is NOT automatically
            # considered a violation.
            # ------------------------------------------------

            if item == "vest":

                continue


            if item not in detected_ppe:

                missing_ppe.add(
                    display_name
                )


        # ====================================================
        # EXPLICIT VIOLATIONS
        # ====================================================

        missing_ppe.update(
            explicit_violations
        )


        is_violation = (
            len(
                missing_ppe
            )
            >
            0
        )


        x1, y1, x2, y2 = (
            person["box"]
        )


        # ====================================================
        # VIOLATION
        # ====================================================

        if is_violation:


            violating_people += 1


            total_missing += (
                len(
                    missing_ppe
                )
            )


            color = (
                0,
                0,
                255
            )


            status = (
                f"ID {person_id} "
                "VIOLATION"
            )


            violation_messages.append({

                "person_id":
                    person_id,

                "missing":
                    sorted(
                        missing_ppe
                    )

            })


            # -----------------------------------------------
            # DATABASE LOGGING
            # -----------------------------------------------

            log_violation(

                f"Person-{person_id}",

                missing_ppe

            )


        # ====================================================
        # COMPLIANT
        # ====================================================

        else:


            compliant_people += 1


            color = (
                0,
                255,
                0
            )


            status = (
                f"ID {person_id} "
                "COMPLIANT"
            )


        # ====================================================
        # PERSON BOX
        # ====================================================

        cv2.rectangle(

            frame,

            (x1, y1),

            (x2, y2),

            color,

            3

        )


        # ====================================================
        # STATUS
        # ====================================================

        cv2.putText(

            frame,

            status,

            (

                x1,

                max(
                    y1 - 10,
                    25
                )

            ),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.65,

            color,

            2

        )


        # ====================================================
        # MISSING PPE
        # ====================================================

        if is_violation:


            text_y = y1 + 25


            for missing in sorted(
                missing_ppe
            ):


                cv2.putText(

                    frame,

                    f"Missing: {missing}",

                    (

                        x1,

                        text_y

                    ),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.5,

                    color,

                    2

                )


                text_y += 22


    # ========================================================
    # UPDATE SYSTEM STATE
    # ========================================================

    with state_lock:


        system_state[
            "workers"
        ] = len(
            persons
        )


        system_state[
            "compliant"
        ] = compliant_people


        system_state[
            "violating"
        ] = violating_people


        system_state[
            "missing_ppe"
        ] = total_missing


        system_state[
            "alarm"
        ] = (
            violating_people
            >
            0
        )


        system_state[
            "last_update"
        ] = (
            datetime.now()
            .isoformat()
        )


    # ========================================================
    # ALARM MANAGER
    # ========================================================

    if violating_people > 0:

        try:

            alarm_manager.start()

        except Exception as error:

            print(
                "Alarm start error:",
                error
            )

    else:

        try:

            alarm_manager.stop()

        except Exception as error:

            print(
                "Alarm stop error:",
                error
            )


    # ========================================================
    # GLOBAL STATUS BAR
    # ========================================================

    if violating_people > 0:


        cv2.rectangle(

            frame,

            (0, 0),

            (
                frame.shape[1],
                55
            ),

            (0, 0, 180),

            -1

        )


        cv2.putText(

            frame,

            "!! PPE VIOLATION - ALARM ACTIVE !!",

            (20, 37),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.9,

            (255, 255, 255),

            2

        )


    else:


        cv2.rectangle(

            frame,

            (0, 0),

            (
                frame.shape[1],
                55
            ),

            (0, 120, 0),

            -1

        )


        cv2.putText(

            frame,

            "ALL DETECTED WORKERS COMPLIANT",

            (20, 37),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.8,

            (255, 255, 255),

            2

        )


    # ========================================================
    # ENCODE FRAME
    # ========================================================

    success, buffer = cv2.imencode(

        ".jpg",

        frame,

        [

            cv2.IMWRITE_JPEG_QUALITY,

            75

        ]

    )


    if success:


        frame_base64 = (
            base64.b64encode(
                buffer
            )
            .decode(
                "utf-8"
            )
        )


        with latest_frame_lock:

            latest_frame = (
                frame_base64
            )


    return {

        "violations":
            violation_messages

    }


# ============================================================
# CAMERA LOOP
# ============================================================

def camera_loop():

    global camera


    print(
        "Opening camera..."
    )


    camera = cv2.VideoCapture(
        0
    )


    if not camera.isOpened():


        print(
            "ERROR: Camera could not be opened."
        )


        with state_lock:

            system_state[
                "monitoring"
            ] = False


        try:

            alarm_manager.stop()

        except Exception:

            pass


        return


    camera.set(
        cv2.CAP_PROP_FRAME_WIDTH,
        1280
    )

    camera.set(
        cv2.CAP_PROP_FRAME_HEIGHT,
        720
    )


    print(
        "Camera started."
    )


    while not stop_event.is_set():


        success, frame = (
            camera.read()
        )


        if not success:


            print(
                "Camera frame read failed."
            )

            break


        try:

            process_frame(
                frame
            )


        except Exception as error:


            print(
                "YOLO processing error:",
                error
            )


            time.sleep(
                0.1
            )


    # ========================================================
    # CLEANUP
    # ========================================================

    camera.release()

    camera = None


    try:

        alarm_manager.stop()

    except Exception as error:

        print(
            "Alarm cleanup error:",
            error
        )


    with state_lock:


        system_state[
            "monitoring"
        ] = False


        system_state[
            "alarm"
        ] = False


        system_state[
            "workers"
        ] = 0


        system_state[
            "compliant"
        ] = 0


        system_state[
            "violating"
        ] = 0


        system_state[
            "missing_ppe"
        ] = 0


    print(
        "Camera monitoring stopped."
    )


# ============================================================
# START MONITORING
# ============================================================

@app.post(
    "/api/monitoring/start"
)
def start_monitoring():

    global monitoring_thread


    with state_lock:


        if system_state[
            "monitoring"
        ]:


            return {

                "success":
                    True,

                "message":
                    "Monitoring already running",

                "monitoring":
                    True

            }


        system_state[
            "monitoring"
        ] = True


    stop_event.clear()


    monitoring_thread = (
        threading.Thread(

            target=camera_loop,

            daemon=True

        )
    )


    monitoring_thread.start()


    return {

        "success":
            True,

        "message":
            "Live YOLO monitoring started",

        "monitoring":
            True

    }


# ============================================================
# STOP MONITORING
# ============================================================

@app.post(
    "/api/monitoring/stop"
)
def stop_monitoring():

    stop_event.set()


    try:

        alarm_manager.stop()

    except Exception as error:

        print(
            "Alarm stop error:",
            error
        )


    with state_lock:


        system_state[
            "monitoring"
        ] = False


        system_state[
            "alarm"
        ] = False


    return {

        "success":
            True,

        "message":
            "Live monitoring stopped",

        "monitoring":
            False,

        "alarm":
            False

    }


# ============================================================
# START ALARM
# ============================================================

@app.post(
    "/api/alarm/start"
)
def start_alarm():

    try:

        alarm_manager.start()

        with state_lock:

            system_state[
                "alarm"
            ] = True


        return {

            "success":
                True,

            "alarm":
                True

        }


    except Exception as error:

        return {

            "success":
                False,

            "alarm":
                False,

            "error":
                str(error)

        }


# ============================================================
# STOP ALARM
# ============================================================

@app.post(
    "/api/alarm/stop"
)
def stop_alarm():

    try:

        alarm_manager.stop()

        with state_lock:

            system_state[
                "alarm"
            ] = False


        return {

            "success":
                True,

            "alarm":
                False

        }


    except Exception as error:

        return {

            "success":
                False,

            "alarm":
                False,

            "error":
                str(error)

        }


# ============================================================
# CURRENT STATUS
# ============================================================

@app.get(
    "/api/status"
)
def get_status():

    with state_lock:

        return dict(
            system_state
        )


# ============================================================
# PROFESSIONAL DASHBOARD API
# ============================================================

@app.get(
    "/api/dashboard"
)
def dashboard():

    with state_lock:

        live_data = dict(
            system_state
        )


    total_violations = (
        get_total_violations()
    )


    workers_involved = (
        get_workers_involved()
    )


    latest_violation = (
        get_latest_violation()
    )


    return {

        "live":
            live_data,

        "history": {

            "total_violations":
                total_violations,

            "workers_involved":
                workers_involved,

            "latest_violation":
                latest_violation

        },

        "timestamp":
            datetime.now().isoformat()

    }


# ============================================================
# VIOLATION HISTORY API
# ============================================================

@app.get(
    "/api/violations"
)
def get_violations():

    try:


        df = get_all_violations()


        df = df.rename(

            columns={

                "id":
                    "ID",

                "timestamp":
                    "Timestamp",

                "person_id":
                    "Person ID",

                "missing_ppe":
                    "Missing PPE",

                "status":
                    "Status"

            }

        )


        df = df.fillna("")


        records = df.to_dict(
            orient="records"
        )


        return {

            "count":
                len(records),

            "violations":
                records

        }


    except Exception as error:


        return {

            "count":
                0,

            "violations":
                [],

            "error":
                str(error)

        }


# ============================================================
# EXCEL EXPORT API
# ============================================================

@app.get(
    "/api/violations/export"
)
def export_violations():

    try:


        excel_file = (
            export_to_excel()
        )


        return FileResponse(

            path=str(
                excel_file
            ),

            filename=(
                "ppe_violation_report.xlsx"
            ),

            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            )

        )


    except Exception as error:


        return {

            "success":
                False,

            "error":
                str(error)

        }


# ============================================================
# LIVE CAMERA WEBSOCKET
# ============================================================

@app.websocket(
    "/ws/camera"
)
async def camera_websocket(
    websocket: WebSocket
):


    await websocket.accept()


    connected_clients.add(
        websocket
    )


    print(
        "React camera connected."
    )


    try:


        while True:


            with latest_frame_lock:

                frame = (
                    latest_frame
                )


            with state_lock:

                status = dict(
                    system_state
                )


            payload = {

                "type":
                    "frame",

                "image":
                    frame,

                "status":
                    status

            }


            await websocket.send_json(
                payload
            )


            await asyncio.sleep(
                0.05
            )


    except WebSocketDisconnect:


        print(
            "React camera disconnected."
        )


    except Exception as error:


        print(
            "WebSocket error:",
            error
        )


    finally:


        connected_clients.discard(
            websocket
        )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get(
    "/api/health"
)
def health_check():

    return {

        "status":
            "healthy",

        "service":
            "Industrial PPE Monitoring API",

        "database":
            "connected",

        "model":
            "loaded",

        "timestamp":
            datetime.now().isoformat()

    }


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event(
    "shutdown"
)
def shutdown():


    print("=" * 50)

    print(
        "Shutting down monitoring system..."
    )

    print("=" * 50)


    stop_event.set()


    try:

        alarm_manager.stop()

        print(
            "Alarm stopped."
        )

    except Exception as error:

        print(
            "Alarm shutdown error:",
            error
        )


    global camera


    if camera is not None:

        camera.release()

        camera = None

        print(
            "Camera released."
        )


    with state_lock:

        system_state[
            "monitoring"
        ] = False

        system_state[
            "alarm"
        ] = False


    print(
        "Backend shutdown complete."
    )