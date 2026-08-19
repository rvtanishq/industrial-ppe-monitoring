from pathlib import Path
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"
IMAGE_PATH = PROJECT_ROOT / "tests" / "images" / "test.jpg"

model = YOLO(str(MODEL_PATH))

results = model.predict(
    source=str(IMAGE_PATH),
    conf=0.40,
    save=True,
    device=0
)

print("\nPrediction completed.")
print("Results saved by YOLO.")