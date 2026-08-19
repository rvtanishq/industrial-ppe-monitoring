from pathlib import Path
import shutil

PROJECT_ROOT = Path(__file__).resolve().parents[2]

LABEL_DIR = PROJECT_ROOT / "datasets" / "construction-ppe" / "labels" / "train"
IMAGE_DIR = PROJECT_ROOT / "datasets" / "construction-ppe" / "images" / "train"

OUTPUT_DIR = PROJECT_ROOT / "tests" / "violation_samples"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

classes = {
    7: "no_helmet",
    8: "no_goggle",
    9: "no_gloves",
    10: "no_boots",
}

max_samples = 10

found = {class_id: 0 for class_id in classes}

for label_file in LABEL_DIR.glob("*.txt"):

    text = label_file.read_text().strip()

    if not text:
        continue

    detected_classes = set()

    for line in text.splitlines():
        parts = line.split()

        if parts:
            class_id = int(parts[0])

            if class_id in classes:
                detected_classes.add(class_id)

    if not detected_classes:
        continue

    # Find corresponding image
    image_file = None

    for extension in [".jpg", ".jpeg", ".png"]:
        candidate = IMAGE_DIR / (label_file.stem + extension)

        if candidate.exists():
            image_file = candidate
            break

    if image_file is None:
        continue

    for class_id in detected_classes:

        if found[class_id] >= max_samples:
            continue

        class_name = classes[class_id]

        class_folder = OUTPUT_DIR / class_name
        class_folder.mkdir(parents=True, exist_ok=True)

        destination = class_folder / image_file.name

        shutil.copy2(image_file, destination)

        found[class_id] += 1

print("\nViolation samples extracted:")
print("-" * 40)

for class_id, class_name in classes.items():
    print(f"{class_name:12} : {found[class_id]} images")

print(f"\nOpen this folder:")
print(OUTPUT_DIR)