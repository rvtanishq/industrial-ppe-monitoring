import base64
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2
import pandas as pd
import torch

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ultralytics import YOLO

from backend.alarm_manager import alarm_manager


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

RECORDS_DIR = PROJECT_ROOT / "records"
RECORDS_DIR.mkdir(exist_ok=True)

DATABASE_FILE = RECORDS_DIR / "ppe_monitoring.db"
EXCEL_FILE = RECORDS_DIR / "ppe_violation_records.xlsx"


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Industrial PPE Monitoring API",
    version="6.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

db_lock = threading.Lock()


def get_db_connection():

    connection = sqlite3.connect(
        DATABASE_FILE,
        check_same_thread=False
    )

    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():

    connection = get_db_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            person_id TEXT NOT NULL,
            missing_ppe TEXT NOT NULL,
            status TEXT NOT NULL
        )
        """
    )

    connection.commit()
    connection.close()

    print(
        "Database initialized:",
        DATABASE_FILE
    )


initialize_database()


# ============================================================
# YOLO MODEL
# ============================================================

print("=" * 60)
print("Loading YOLO model...")
print("=" * 60)

if not MODEL_PATH.exists():

    raise FileNotFoundError(
        f"YOLO model not found: {MODEL_PATH}"
    )

model = YOLO(
    str(MODEL_PATH)
)


# ============================================================
# DEVICE
# ============================================================

if torch.cuda.is_available():

    YOLO_DEVICE = 0

    print(
        "CUDA available."
    )

    print(
        "GPU:",
        torch.cuda.get_device_name(0)
    )

else:

    YOLO_DEVICE = "cpu"

    print(
        "CUDA not available."
    )

    print(
        "Using CPU."
    )


print(
    "YOLO device:",
    YOLO_DEVICE
)

print(
    "YOLO model loaded successfully."
)

print(
    "Classes:",
    model.names
)


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
    "no_helmet": "Helmet",
    "no_goggle": "Safety Goggles",
    "no_gloves": "Gloves",
    "no_boots": "Safety Boots"
}

REQUIRED_PPE = {
    "helmet": "Helmet",
    "gloves": "Gloves",
    "vest": "Safety Vest",
    "boots": "Safety Boots",
    "goggles": "Safety Goggles"
}


# ============================================================
# SYSTEM STATE
# ============================================================

system_state = {
    "monitoring": False,
    "alarm": False,
    "workers": 0,
    "compliant": 0,
    "violating": 0,
    "missing_ppe": 0,
    "last_update": None
}

state_lock = threading.Lock()


# ============================================================
# VIOLATION COOLDOWN
# ============================================================

last_logged = {}

VIOLATION_COOLDOWN = 5


# ============================================================
# FRAME PERFORMANCE CONTROL
# ============================================================

processing_lock = threading.Lock()

last_processed_time = 0.0

MIN_PROCESS_INTERVAL = 0.08


# ============================================================
# IOU
# ============================================================

def calculate_iou(box_a, box_b):

    ax1, ay1, ax2, ay2 = box_a

    bx1, by1, bx2, by2 = box_b

    intersection_x1 = max(ax1, bx1)
    intersection_y1 = max(ay1, by1)

    intersection_x2 = min(ax2, bx2)
    intersection_y2 = min(ay2, by2)

    width = max(
        0,
        intersection_x2 - intersection_x1
    )

    height = max(
        0,
        intersection_y2 - intersection_y1
    )

    intersection_area = (
        width * height
    )

    area_a = (
        max(0, ax2 - ax1)
        *
        max(0, ay2 - ay1)
    )

    area_b = (
        max(0, bx2 - bx1)
        *
        max(0, by2 - by1)
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
        intersection_area / union
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

def point_inside_box(point, box):

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

        person_box = person["box"]

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
# DATABASE LOGGER
# ============================================================

def save_violation_to_database(
    person_id,
    missing_ppe
):

    now = time.time()

    key = (
        person_id,
        tuple(
            sorted(
                missing_ppe
            )
        )
    )

    previous = last_logged.get(
        key,
        0
    )

    if (
        now - previous
        <
        VIOLATION_COOLDOWN
    ):

        return

    last_logged[key] = now

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    missing_text = ", ".join(
        sorted(
            missing_ppe
        )
    )

    try:

        with db_lock:

            connection = get_db_connection()

            cursor = connection.cursor()

            cursor.execute(
                """
                INSERT INTO violations
                (
                    timestamp,
                    person_id,
                    missing_ppe,
                    status
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    timestamp,
                    person_id,
                    missing_text,
                    "VIOLATION"
                )
            )

            connection.commit()

            connection.close()

        print(
            "DATABASE VIOLATION LOGGED:",
            person_id,
            missing_text
        )

    except Exception as error:

        print(
            "Database logging error:",
            error
        )


# ============================================================
# EXCEL EXPORT
# ============================================================

def create_excel_file():

    connection = get_db_connection()

    query = """
        SELECT
            id AS ID,
            timestamp AS Timestamp,
            person_id AS "Person ID",
            missing_ppe AS "Missing PPE",
            status AS Status
        FROM violations
        ORDER BY id DESC
    """

    df = pd.read_sql_query(
        query,
        connection
    )

    connection.close()

    df.to_excel(
        EXCEL_FILE,
        index=False
    )

    return EXCEL_FILE


# ============================================================
# RESET STATE
# ============================================================

def reset_monitoring_state():

    try:

        alarm_manager.stop()

    except Exception:
        pass

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

        system_state[
            "last_update"
        ] = None


# ============================================================
# PROCESS FRAME
# ============================================================

def process_frame(frame):

    global last_processed_time

    current_time = time.time()

    # --------------------------------------------------------
    # FRAME RATE LIMIT
    # --------------------------------------------------------

    if (
        current_time
        -
        last_processed_time
        <
        MIN_PROCESS_INTERVAL
    ):

        return {
            "success": False,
            "skipped": True,
            "image": None,
            "violations": []
        }


    # --------------------------------------------------------
    # DON'T RUN TWO YOLO INFERENCES AT ONCE
    # --------------------------------------------------------

    if not processing_lock.acquire(
        blocking=False
    ):

        return {
            "success": False,
            "skipped": True,
            "image": None,
            "violations": []
        }


    last_processed_time = current_time


    try:

        # ====================================================
        # RESIZE FOR PERFORMANCE
        # ====================================================

        original_height, original_width = (
            frame.shape[:2]
        )

        MAX_WIDTH = 960

        if original_width > MAX_WIDTH:

            scale = (
                MAX_WIDTH /
                original_width
            )

            new_width = MAX_WIDTH

            new_height = int(
                original_height * scale
            )

            frame = cv2.resize(
                frame,
                (
                    new_width,
                    new_height
                ),
                interpolation=cv2.INTER_AREA
            )


        # ====================================================
        # YOLO TRACKING
        # ====================================================

        results = model.track(

            source=frame,

            conf=0.40,

            imgsz=640,

            persist=True,

            tracker="bytetrack.yaml",

            device=YOLO_DEVICE,

            verbose=False

        )

        result = results[0]

        persons = []

        ppe_detections = []


        # ====================================================
        # READ YOLO DETECTIONS
        # ====================================================

        if result.boxes is not None:

            boxes = result.boxes

            for index in range(
                len(boxes)
            ):

                class_id = int(
                    boxes.cls[index]
                )

                class_name = (
                    model.names[
                        class_id
                    ]
                )

                xyxy = (
                    boxes.xyxy[index]
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


                # ==========================================
                # PERSON
                # ==========================================

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
                            boxes.id[index]
                        )

                    if track_id is None:

                        track_id = (
                            len(persons) + 1
                        )

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


                # ==========================================
                # PPE
                # ==========================================

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


                # ==========================================
                # EXPLICIT VIOLATION
                # ==========================================

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


        # ====================================================
        # ASSIGN PPE TO PERSON
        # ====================================================

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


        # ====================================================
        # STATISTICS
        # ====================================================

        compliant_people = 0

        violating_people = 0

        total_missing = 0

        violation_messages = []


        # ====================================================
        # DRAW PERSONS AND PPE
        # ====================================================

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


            # ------------------------------------------------
            # CALCULATE MISSING PPE
            # ------------------------------------------------

            missing_ppe = set()


            for (
                item,
                display_name
            ) in REQUIRED_PPE.items():

                # Vest is not considered mandatory
                # because your model has no no_vest class.

                if item == "vest":

                    continue

                if (
                    item
                    not in
                    detected_ppe
                ):

                    missing_ppe.add(
                        display_name
                    )


            # Add explicit no_* detections

            missing_ppe.update(
                explicit_violations
            )


            is_violation = (
                len(missing_ppe) > 0
            )


            x1, y1, x2, y2 = (
                person["box"]
            )


            # ------------------------------------------------
            # VIOLATION
            # ------------------------------------------------

            if is_violation:

                violating_people += 1

                total_missing += len(
                    missing_ppe
                )

                color = (
                    0,
                    0,
                    255
                )

                status_text = (
                    f"ID {person_id} "
                    f"VIOLATION"
                )


                violation_messages.append({

                    "person_id":
                        person_id,

                    "missing":
                        sorted(
                            missing_ppe
                        )

                })


                save_violation_to_database(

                    f"Person-{person_id}",

                    missing_ppe

                )


            # ------------------------------------------------
            # COMPLIANT
            # ------------------------------------------------

            else:

                compliant_people += 1

                color = (
                    0,
                    255,
                    0
                )

                status_text = (
                    f"ID {person_id} "
                    f"COMPLIANT"
                )


            # =================================================
            # PERSON BOX
            # =================================================

            cv2.rectangle(

                frame,

                (
                    x1,
                    y1
                ),

                (
                    x2,
                    y2
                ),

                color,

                3

            )


            # =================================================
            # PERSON STATUS
            # =================================================

            cv2.putText(

                frame,

                status_text,

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


            # =================================================
            # MISSING PPE TEXT
            # =================================================

            if is_violation:

                text_y = (
                    y1 + 25
                )

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


        # ====================================================
        # DRAW ALL RAW PPE DETECTIONS
        #
        # This makes helmet/gloves/boots/goggles boxes visible
        # directly on the camera.
        # ====================================================

        for detection in ppe_detections:

            x1, y1, x2, y2 = (
                detection["box"]
            )

            class_name = (
                detection["class"]
            )

            if (
                class_name
                in
                VIOLATION_CLASSES
            ):

                box_color = (
                    0,
                    0,
                    255
                )

                label = (
                    VIOLATION_CLASSES[
                        class_name
                    ]
                    +
                    " MISSING"
                )

            else:

                box_color = (
                    255,
                    200,
                    0
                )

                label = class_name.upper()


            cv2.rectangle(

                frame,

                (
                    x1,
                    y1
                ),

                (
                    x2,
                    y2
                ),

                box_color,

                2

            )


            cv2.putText(

                frame,

                label,

                (
                    x1,
                    max(
                        y1 - 5,
                        15
                    )
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.5,

                box_color,

                2

            )


        # ====================================================
        # ALARM STATUS
        # ====================================================

        violation_exists = (
            violating_people > 0
        )


        with state_lock:

            system_state[
                "workers"
            ] = len(persons)

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
            ] = violation_exists

            system_state[
                "last_update"
            ] = datetime.now().isoformat()


        # ====================================================
        # ALARM CONTROL
        # ====================================================

        try:

            if violation_exists:

                alarm_manager.start()

            else:

                alarm_manager.stop()

        except Exception as error:

            print(
                "Alarm control error:",
                error
            )


        # ====================================================
        # TOP STATUS BAR
        # ====================================================

        if violation_exists:

            cv2.rectangle(

                frame,

                (
                    0,
                    0
                ),

                (
                    frame.shape[1],
                    55
                ),

                (
                    0,
                    0,
                    180
                ),

                -1

            )

            cv2.putText(

                frame,

                "!! PPE VIOLATION - ALARM ACTIVE !!",

                (
                    20,
                    37
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.9,

                (
                    255,
                    255,
                    255
                ),

                2

            )

        else:

            cv2.rectangle(

                frame,

                (
                    0,
                    0
                ),

                (
                    frame.shape[1],
                    55
                ),

                (
                    0,
                    120,
                    0
                ),

                -1

            )

            cv2.putText(

                frame,

                "ALL DETECTED WORKERS COMPLIANT",

                (
                    20,
                    37
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (
                    255,
                    255,
                    255
                ),

                2

            )


        # ====================================================
        # ENCODE FRAME
        # ====================================================

        success, buffer = cv2.imencode(

            ".jpg",

            frame,

            [
                cv2.IMWRITE_JPEG_QUALITY,
                65
            ]

        )


        if not success:

            return {

                "success":
                    False,

                "skipped":
                    False,

                "violations":
                    violation_messages,

                "image":
                    None

            }


        frame_base64 = (
            base64.b64encode(
                buffer
            ).decode(
                "utf-8"
            )
        )


        return {

            "success":
                True,

            "skipped":
                False,

            "violations":
                violation_messages,

            "image":
                frame_base64

        }


    except Exception as error:

        print(
            "Frame processing error:",
            error
        )

        return {

            "success":
                False,

            "skipped":
                False,

            "violations":
                [],

            "image":
                None,

            "error":
                str(error)

        }


    finally:

        processing_lock.release()


# ============================================================
# START MONITORING
# ============================================================

@app.post(
    "/api/monitoring/start"
)
def start_monitoring():

    with state_lock:

        system_state[
            "monitoring"
        ] = True

    return {

        "success":
            True,

        "message":
            "Browser camera monitoring started",

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

    reset_monitoring_state()

    return {

        "success":
            True,

        "message":
            "Monitoring stopped",

        "monitoring":
            False,

        "alarm":
            False

    }


# ============================================================
# MANUAL ALARM START
# ============================================================

@app.post(
    "/api/alarm/start"
)
async def start_alarm():

    try:

        alarm_manager.start()

    except Exception as error:

        print(
            "Alarm start error:",
            error
        )


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


# ============================================================
# MANUAL ALARM STOP
# ============================================================

@app.post(
    "/api/alarm/stop"
)
async def stop_alarm():

    try:

        alarm_manager.stop()

    except Exception as error:

        print(
            "Alarm stop error:",
            error
        )


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


# ============================================================
# STATUS
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
# DASHBOARD
# ============================================================

@app.get(
    "/api/dashboard"
)
def dashboard():

    with state_lock:

        live_data = dict(
            system_state
        )


    connection = get_db_connection()

    cursor = connection.cursor()


    cursor.execute(
        """
        SELECT COUNT(*)
        FROM violations
        """
    )

    total_violations = (
        cursor.fetchone()[0]
    )


    cursor.execute(
        """
        SELECT COUNT(
            DISTINCT person_id
        )
        FROM violations
        """
    )

    workers_involved = (
        cursor.fetchone()[0]
    )


    connection.close()


    return {

        "live":
            live_data,

        "history": {

            "total_violations":
                total_violations,

            "workers_involved":
                workers_involved

        },

        "timestamp":
            datetime.now().isoformat()

    }


# ============================================================
# VIOLATIONS
# ============================================================

@app.get(
    "/api/violations"
)
def get_violations():

    connection = get_db_connection()

    cursor = connection.cursor()


    cursor.execute(
        """
        SELECT
            id,
            timestamp,
            person_id,
            missing_ppe,
            status
        FROM violations
        ORDER BY id DESC
        """
    )


    rows = cursor.fetchall()

    connection.close()


    violations = []


    for row in rows:

        violations.append({

            "ID":
                row["id"],

            "Timestamp":
                row["timestamp"],

            "Person ID":
                row["person_id"],

            "Missing PPE":
                row["missing_ppe"],

            "Status":
                row["status"]

        })


    return {

        "count":
            len(violations),

        "violations":
            violations

    }


# ============================================================
# DOWNLOAD EXCEL
# ============================================================

@app.get(
    "/api/violations/download"
)
def download_excel():

    try:

        excel_file = (
            create_excel_file()
        )

        return StreamingResponse(

            open(
                excel_file,
                "rb"
            ),

            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),

            headers={

                "Content-Disposition":
                    'attachment; filename="ppe_violation_records.xlsx"'

            }

        )

    except Exception as error:

        return {

            "success":
                False,

            "error":
                str(error)

        }


# ============================================================
# CAMERA WEBSOCKET
# ============================================================

@app.websocket(
    "/ws/camera"
)
async def camera_websocket(
    websocket: WebSocket
):

    await websocket.accept()

    print(
        "Browser camera connected."
    )


    try:

        while True:

            message = (
                await websocket.receive_json()
            )


            # =================================================
            # START
            # =================================================

            if (
                message.get("type")
                ==
                "start"
            ):

                with state_lock:

                    system_state[
                        "monitoring"
                    ] = True


                await websocket.send_json({

                    "type":
                        "status",

                    "status":
                        dict(
                            system_state
                        )

                })

                continue


            # =================================================
            # STOP
            # =================================================

            if (
                message.get("type")
                ==
                "stop"
            ):

                reset_monitoring_state()


                await websocket.send_json({

                    "type":
                        "status",

                    "status":
                        dict(
                            system_state
                        )

                })

                continue


            # =================================================
            # FRAME
            # =================================================

            if (
                message.get("type")
                !=
                "frame"
            ):

                continue


            # -------------------------------------------------
            # CHECK MONITORING STATE
            # -------------------------------------------------

            with state_lock:

                monitoring = (
                    system_state[
                        "monitoring"
                    ]
                )


            if not monitoring:

                continue


            image_data = (
                message.get("image")
            )


            if not image_data:

                continue


            # =================================================
            # REMOVE DATA URL PREFIX
            # =================================================

            if "," in image_data:

                image_data = (
                    image_data.split(
                        ",",
                        1
                    )[1]
                )


            # =================================================
            # DECODE IMAGE
            # =================================================

            try:

                image_bytes = (
                    base64.b64decode(
                        image_data
                    )
                )


                numpy_array = (
                    __import__(
                        "numpy"
                    ).frombuffer(
                        image_bytes,
                        dtype="uint8"
                    )
                )


                frame = cv2.imdecode(

                    numpy_array,

                    cv2.IMREAD_COLOR

                )


                if frame is None:

                    continue


            except Exception as error:

                print(
                    "Frame decoding error:",
                    error
                )

                continue


            # =================================================
            # PROCESS YOLO
            # =================================================

            result = process_frame(
                frame
            )


            # =================================================
            # SKIPPED FRAME
            # =================================================

            if (
                result.get(
                    "skipped"
                )
                is True
            ):

                continue


            # =================================================
            # SEND RESULT
            # =================================================

            with state_lock:

                status = dict(
                    system_state
                )


            await websocket.send_json({

                "type":
                    "result",

                "image":
                    result.get(
                        "image"
                    ),

                "violations":
                    result.get(
                        "violations",
                        []
                    ),

                "status":
                    status

            })


    except WebSocketDisconnect:

        print(
            "Browser camera disconnected."
        )


    except Exception as error:

        print(
            "WebSocket error:",
            error
        )


    finally:

        reset_monitoring_state()


        print(
            "Camera monitoring connection closed."
        )


# ============================================================
# ROOT
# ============================================================

@app.get(
    "/"
)
def root():

    return {

        "name":
            "Industrial PPE Monitoring API",

        "version":
            "6.0.0",

        "status":
            "running",

        "architecture":
            "Browser Camera + FastAPI + YOLO + SQLite",

        "docs":
            "/docs"

    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/health"
)
def health():

    return {

        "status":
            "healthy",

        "model":
            "loaded",

        "database":
            "connected",

        "device":
            (
                "GPU"
                if YOLO_DEVICE == 0
                else "CPU"
            ),

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

    print("=" * 60)

    print(
        "Shutting down monitoring system..."
    )

    print("=" * 60)


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
        "Backend shutdown complete."
    )