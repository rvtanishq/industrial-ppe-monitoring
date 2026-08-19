from pathlib import Path
from ultralytics import YOLO

# Find project root automatically
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Load trained model
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

print(f"Loading model from: {MODEL_PATH}")

model = YOLO(str(MODEL_PATH))

print("\nModel loaded successfully!")
print("\nClasses learned by the model:\n")

for class_id, class_name in model.names.items():
    print(f"{class_id}: {class_name}")