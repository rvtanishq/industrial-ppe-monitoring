import sqlite3
from pathlib import Path
from datetime import datetime
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATABASE_DIR = PROJECT_ROOT / "database"
DATABASE_DIR.mkdir(exist_ok=True)

DATABASE_FILE = DATABASE_DIR / "ppe_monitoring.db"

RECORDS_DIR = PROJECT_ROOT / "records"
RECORDS_DIR.mkdir(exist_ok=True)

EXCEL_FILE = RECORDS_DIR / "ppe_violation_records.xlsx"


# ============================================================
# DATABASE CONNECTION
# ============================================================

def get_connection():

    connection = sqlite3.connect(
        DATABASE_FILE,
        check_same_thread=False
    )

    connection.row_factory = sqlite3.Row

    return connection


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def initialize_database():

    connection = get_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS violations (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            timestamp TEXT NOT NULL,

            person_id TEXT NOT NULL,

            missing_ppe TEXT NOT NULL,

            status TEXT NOT NULL

        )
        """
    )

    connection.commit()
    connection.close()

    print("Database initialized successfully.")
    print(f"Database: {DATABASE_FILE}")


# ============================================================
# ADD VIOLATION
# ============================================================

def add_violation(
    person_id,
    missing_ppe
):

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    missing_text = ", ".join(
        sorted(missing_ppe)
    )

    connection = get_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO violations
        (
            timestamp,
            person_id,
            missing_ppe,
            status
        )

        VALUES (?, ?, ?, ?)
        """,

        (
            timestamp,
            person_id,
            missing_text,
            "VIOLATION"
        )
    )

    connection.commit()
    connection.close()


# ============================================================
# GET ALL VIOLATIONS
# ============================================================

def get_all_violations():

    connection = get_connection()

    query = """
        SELECT
            id,
            timestamp,
            person_id,
            missing_ppe,
            status

        FROM violations

        ORDER BY id DESC
    """

    df = pd.read_sql_query(
        query,
        connection
    )

    connection.close()

    return df


# ============================================================
# GET TOTAL VIOLATIONS
# ============================================================

def get_total_violations():

    connection = get_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT COUNT(*)
        FROM violations
        """
    )

    result = cursor.fetchone()[0]

    connection.close()

    return result


# ============================================================
# GET UNIQUE WORKERS INVOLVED
# ============================================================

def get_workers_involved():

    connection = get_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT COUNT(
            DISTINCT person_id
        )

        FROM violations
        """
    )

    result = cursor.fetchone()[0]

    connection.close()

    return result


# ============================================================
# GET LATEST VIOLATION
# ============================================================

def get_latest_violation():

    connection = get_connection()

    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT
            timestamp

        FROM violations

        ORDER BY id DESC

        LIMIT 1
        """
    )

    result = cursor.fetchone()

    connection.close()

    if result is None:
        return None

    return result["timestamp"]


# ============================================================
# EXPORT DATABASE TO EXCEL
# ============================================================

def export_to_excel():

    df = get_all_violations()

    df = df.rename(
        columns={
            "id": "ID",
            "timestamp": "Timestamp",
            "person_id": "Person ID",
            "missing_ppe": "Missing PPE",
            "status": "Status"
        }
    )

    df.to_excel(
        EXCEL_FILE,
        index=False
    )

    return EXCEL_FILE