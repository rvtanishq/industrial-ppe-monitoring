from ultralytics import YOLO

# Load our trained PPE model
model = YOLO("models/best.pt")

# Test on an image
results = model.predict(
    source="test_image.jpg",
    conf=0.5,
    save=True
)

print("Prediction completed.")