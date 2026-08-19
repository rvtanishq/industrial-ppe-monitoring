from ultralytics import YOLO

# Load your trained model
model = YOLO(r"C:\Users\Tanishq R V\OneDrive\Desktop\industrial_ppe_monitoring\models\best.pt")

# Put the path of your own image here
image_path = image_path = r"C:\Users\Tanishq R V\OneDrive\Desktop\industrial_ppe_monitoring\datasets\construction-ppe\images\test\image1.jpeg"

# Run detection
results = model.predict(
    source=image_path,
    conf=0.25,
    save=True
)

print("Detection completed!")
print("Results saved in the runs/detect folder.")