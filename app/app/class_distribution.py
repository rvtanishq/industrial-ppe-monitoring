from pathlib import Path
from collections import Counter

PROJECT_ROOT = Path(__file__).resolve().parents[2]

LABEL_DIR = PROJECT_ROOT / "datasets" / "construction-ppe" / "labels" / "train"

class_names = {
    0: "helmet",
    1: "gloves",
    2: "vest",
    3: "boots",
    4: "goggles",
    5: "none",
    6: "Person",
    7: "no_helmet",
    8: "no_goggle",
    9: "no_gloves",
    10: "no_boots"
}

counts = Counter()

for file in LABEL_DIR.glob("*.txt"):
    with open(file, "r") as f:
        for line in f:
            parts = line.strip().split()

            if parts:
                class_id = int(parts[0])
                counts[class_id] += 1

print("\nTRAINING CLASS DISTRIBUTION")
print("-" * 40)

for class_id, name in class_names.items():
    print(f"{class_id:2}  {name:12} : {counts[class_id]}")

print("-" * 40)
print(f"Total annotations: {sum(counts.values())}")