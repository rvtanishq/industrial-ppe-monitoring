from ultralytics import YOLO

model = YOLO(
    r"C:\Users\Tanishq R V\OneDrive\Desktop\industrial_ppe_monitoring\models\best.pt"
)

print(model.names)