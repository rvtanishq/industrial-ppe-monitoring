from pathlib import Path
import cv2
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

model = YOLO(str(MODEL_PATH))

print("Model loaded successfully.")
print("Starting PPE detection...")
print("Press Q to quit.")

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Could not open webcam.")

cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

# Stronger threshold for violation predictions
VIOLATION_THRESHOLD = 0.70

while True:

    ret, frame = cap.read()

    if not ret:
        break

    # Get predictions with low base threshold
    results = model.predict(
        source=frame,
        conf=0.15,
        device=0,
        imgsz=640,
        verbose=False
    )

    result = results[0]

    # Start with the original frame
    annotated = frame.copy()

    if result.boxes is not None:

        for box in result.boxes:

            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            class_name = model.names[class_id]

            # -----------------------------------------------
            # Higher threshold for NO-PPE classes
            # -----------------------------------------------

            if class_name in {
                "no_helmet",
                "no_goggle",
                "no_gloves",
                "no_boots"
            }:

                if confidence < VIOLATION_THRESHOLD:
                    continue

            # -----------------------------------------------
            # Bounding box
            # -----------------------------------------------

            x1, y1, x2, y2 = map(
                int,
                box.xyxy[0].tolist()
            )

            label = f"{class_name} {confidence:.2f}"

            cv2.rectangle(
                annotated,
                (x1, y1),
                (x2, y2),
                (255, 255, 255),
                2
            )

            cv2.putText(
                annotated,
                label,
                (x1, max(y1 - 8, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )

    cv2.imshow(
        "Industrial PPE Detection",
        annotated
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

print("System stopped.")