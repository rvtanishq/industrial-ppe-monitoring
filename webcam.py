from ultralytics import YOLO
import cv2

# Load trained PPE detection model
model = YOLO(r"C:\Users\Tanishq R V\OneDrive\Desktop\industrial_ppe_monitoring\models\best.pt")

# Open webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error: Could not open webcam.")
    exit()

while True:
    ret, frame = cap.read()

    if not ret:
        print("Error: Could not read frame.")
        break

    # Run YOLO prediction
    results = model.predict(
        source=frame,
        conf=0.40,
        verbose=False
    )

    # Draw detections
    annotated_frame = results[0].plot()

    # Display
    cv2.imshow("Industrial PPE Monitoring", annotated_frame)

    # Press Q to quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()