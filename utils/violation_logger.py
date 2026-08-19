import csv
from pathlib import Path
from datetime import datetime


PROJECT_ROOT = Path(__file__).resolve().parents[1]

LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOG_FILE = LOG_DIR / "violations.csv"


def initialize_log():

    if not LOG_FILE.exists():

        with open(LOG_FILE, "w", newline="", encoding="utf-8") as file:

            writer = csv.writer(file)

            writer.writerow([
                "Timestamp",
                "Person ID",
                "Missing PPE",
                "Status"
            ])


def log_violation(person_id, missing_ppe):

    initialize_log()

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    missing = ", ".join(missing_ppe)

    with open(LOG_FILE, "a", newline="", encoding="utf-8") as file:

        writer = csv.writer(file)

        writer.writerow([
            timestamp,
            person_id,
            missing,
            "NON-COMPLIANT"
        ])


def get_log_file():

    initialize_log()

    return LOG_FILE