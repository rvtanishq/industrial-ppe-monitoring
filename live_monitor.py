import cv2
import time
import threading
import winsound
from datetime import datetime
from ultralytics import YOLO


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_PATH = (
    r"C:\Users\Tanishq R V\OneDrive\Desktop"
    r"\industrial_ppe_monitoring\models\best.pt"
)

CAMERA_ID = 0
CONFIDENCE = 0.40

BEEP_FREQUENCY = 1200
BEEP_DURATION = 500


# ============================================================
# LOAD MODEL
# ============================================================

print("Loading PPE model...")

model = YOLO(MODEL_PATH)

print("Model loaded.")
print("Starting person tracking...")


# ============================================================
# ALARM
# ============================================================

alarm_running = False
alarm_thread = None


def alarm_loop():

    global alarm_running

    while alarm_running:

        try:

            winsound.Beep(
                BEEP_FREQUENCY,
                BEEP_DURATION
            )

            time.sleep(0.1)

        except:

            break


def start_alarm():

    global alarm_running
    global alarm_thread

    if not alarm_running:

        alarm_running = True

        alarm_thread = threading.Thread(
            target=alarm_loop,
            daemon=True
        )

        alarm_thread.start()


def stop_alarm():

    global alarm_running

    alarm_running = False


# ============================================================
# CAMERA
# ============================================================

cap = cv2.VideoCapture(CAMERA_ID)

if not cap.isOpened():

    print("ERROR: Camera could not be opened.")
    exit()


# ============================================================
# CLASS NAMES
# ============================================================

PERSON_CLASS = "Person"

VIOLATIONS = {

    "no_helmet": "NO HELMET",
    "no_gloves": "NO GLOVES",
    "no_boots": "NO BOOTS",
    "no_goggle": "NO GOGGLES"
}


# ============================================================
# TRACKING
# ============================================================

print("Tracking workers...")

while True:

    success, frame = cap.read()

    if not success:

        print("Could not read camera frame.")
        break


    # ========================================================
    # YOLO TRACKING
    # ========================================================

    results = model.track(
        source=frame,
        persist=True,
        conf=CONFIDENCE,
        tracker="bytetrack.yaml",
        verbose=False
    )

    result = results[0]

    annotated = result.plot()


    # ========================================================
    # DETECTION INFORMATION
    # ========================================================

    person_count = 0
    violation_count = 0

    active_violations = []


    if result.boxes is not None:

        for i, box in enumerate(result.boxes):

            class_id = int(box.cls[0])

            class_name = model.names[class_id]

            confidence = float(box.conf[0])


            # ------------------------------------------------
            # TRACK ID
            # ------------------------------------------------

            track_id = None

            if box.id is not None:

                track_id = int(box.id[0])


            # ------------------------------------------------
            # PERSON
            # ------------------------------------------------

            if class_name == PERSON_CLASS:

                person_count += 1

                if track_id is not None:

                    person_text = (
                        f"Worker #{track_id}"
                    )

                    # Get bounding box
                    x1, y1, x2, y2 = map(
                        int,
                        box.xyxy[0]
                    )

                    cv2.putText(
                        annotated,
                        person_text,
                        (x1, max(y1 - 10, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (255, 255, 0),
                        2
                    )


            # ------------------------------------------------
            # PPE VIOLATION
            # ------------------------------------------------

            elif class_name in VIOLATIONS:

                violation_name = VIOLATIONS[
                    class_name
                ]

                violation_count += 1

                active_violations.append(
                    violation_name
                )


    # ========================================================
    # REMOVE DUPLICATES
    # ========================================================

    active_violations = list(
        set(active_violations)
    )


    # ========================================================
    # ALARM
    # ========================================================

    if violation_count > 0:

        start_alarm()

        # Red warning banner

        cv2.rectangle(
            annotated,
            (0, 0),
            (annotated.shape[1], 110),
            (0, 0, 255),
            -1
        )

        cv2.putText(
            annotated,
            "!!! PPE VIOLATION !!!",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (255, 255, 255),
            3
        )

        violation_text = " | ".join(
            active_violations
        )

        cv2.putText(
            annotated,
            violation_text,
            (20, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2
        )

    else:

        stop_alarm()

        cv2.rectangle(
            annotated,
            (0, 0),
            (annotated.shape[1], 70),
            (0, 150, 0),
            -1
        )

        cv2.putText(
            annotated,
            "PPE STATUS: COMPLIANT",
            (20, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 255, 255),
            2
        )


    # ========================================================
    # INFORMATION PANEL
    # ========================================================

    height, width = annotated.shape[:2]

    panel_x = width - 300

    cv2.rectangle(
        annotated,
        (panel_x, 120),
        (width - 10, 300),
        (30, 30, 30),
        -1
    )

    cv2.putText(
        annotated,
        "MANAGER MONITOR",
        (panel_x + 15, 150),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2
    )

    cv2.putText(
        annotated,
        f"Workers: {person_count}",
        (panel_x + 15, 185),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2
    )

    cv2.putText(
        annotated,
        f"Violations: {violation_count}",
        (panel_x + 15, 220),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 0, 255),
        2
    )

    alarm_status = (
        "ACTIVE"
        if violation_count > 0
        else "OFF"
    )

    cv2.putText(
        annotated,
        f"Alarm: {alarm_status}",
        (panel_x + 15, 255),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 0, 255)
        if violation_count > 0
        else (0, 255, 0),
        2
    )


    # ========================================================
    # TIMESTAMP
    # ========================================================

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    cv2.putText(
        annotated,
        timestamp,
        (20, height - 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        2
    )


    # ========================================================
    # DISPLAY
    # ========================================================

    cv2.imshow(
        "Industrial PPE Manager Monitoring",
        annotated
    )


    # ========================================================
    # EXIT
    # ========================================================

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):

        break


# ============================================================
# CLEANUP
# ============================================================

stop_alarm()

cap.release()

cv2.destroyAllWindows()

print("Monitoring stopped.")