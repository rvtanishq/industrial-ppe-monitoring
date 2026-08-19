import cv2
from ultralytics import YOLO

# Load trained PPE detection model
model = YOLO(
    r"C:\Users\Tanishq R V\OneDrive\Desktop\industrial_ppe_monitoring\models\best.pt"
)

# Open webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error: Could not open webcam.")
    exit()

print("Webcam started.")
print("Press 'q' to quit.")

while True:
    ret, frame = cap.read()

    if not ret:
        print("Error: Could not read frame.")
        break

    # Run YOLO detection
    results = model.predict(
        source=frame,
        conf=0.40,
        device=0,
        verbose=False
    )

    # Draw detections
    annotated_frame = results[0].plot()

    # Display result
    cv2.imshow("Industrial PPE Monitoring", annotated_frame)

    # Press q to exit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()