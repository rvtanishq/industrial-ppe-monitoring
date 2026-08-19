from ultralytics import YOLO
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Model path
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"

# Test image
IMAGE_PATH = PROJECT_ROOT / "datasets" / "construction-ppe" / "images" / "test" / "image1.jpeg"

# Load model
model = YOLO(str(MODEL_PATH))

# Run detection
results = model.predict(
    source=str(IMAGE_PATH),
    conf=0.40,
    save=True,
    device=0
)

# Classes that indicate PPE violations
violation_classes = {
    "no_helmet",
    "no_goggle",
    "no_gloves",
    "no_boots"
}

print("\n" + "=" * 50)
print("        PPE SAFETY MONITORING RESULT")
print("=" * 50)

violations_found = []

for result in results:
    for box in result.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        class_name = model.names[class_id]

        print(f"{class_name}: {confidence:.2f}")

        if class_name in violation_classes:
            violations_found.append(
                f"{class_name} ({confidence:.2f})"
            )

print("\n" + "-" * 50)

if violations_found:
    print("⚠️ SAFETY VIOLATION DETECTED")

    for violation in violations_found:
        print(f"  - {violation}")

else:
    print("✅ NO PPE VIOLATIONS DETECTED")

print("-" * 50)
print("Detection image saved in runs/detect/")