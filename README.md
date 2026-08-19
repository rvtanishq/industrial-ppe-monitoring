# Industrial PPE Monitoring System

A real-time AI-powered Personal Protective Equipment (PPE) monitoring system that uses YOLO object detection, FastAPI, React, WebSockets, and SQLite to monitor workplace safety compliance.

## Overview

The Industrial PPE Monitoring System uses a browser camera to detect workers and identify whether required PPE is being worn.

The system can detect:

- Person
- Helmet
- Gloves
- Safety Vest
- Safety Boots
- Safety Goggles
- No Helmet
- No Gloves
- No Boots
- No Goggles

When a PPE violation is detected, the system:

1. Identifies the worker.
2. Determines the missing PPE.
3. Displays the violation on the live camera.
4. Activates the safety alarm.
5. Stores the violation in SQLite.
6. Displays violation statistics on the dashboard.
7. Allows violation records to be exported to Excel.

## Features

- Real-time browser camera monitoring
- YOLO-based PPE detection
- Worker tracking using ByteTrack
- Automatic missing-PPE identification
- Worker compliance status
- Real-time violation alerts
- Automatic alarm activation
- SQLite violation database
- Violation history
- Excel report generation
- React dashboard
- FastAPI REST API
- WebSocket-based real-time communication

## System Architecture

```text
Browser Camera
      │
      ▼
React Frontend
      │
      │ WebSocket
      ▼
FastAPI Backend
      │
      ▼
YOLO PPE Detection
      │
      ├── Person Detection
      ├── PPE Detection
      └── Violation Detection
      │
      ▼
Violation Analysis
      │
      ├── Live Dashboard
      ├── Alarm
      ├── SQLite Database
      └── Excel Export

      ## ▶️ How to Run the Project Locally

Follow these steps to run the Industrial PPE Monitoring System on a Windows machine.

### 1. Prerequisites

Install the following:

* Python 3.10+
* Node.js 18+
* npm
* Git
* Google Chrome or another modern browser

Verify the installations:

```powershell
python --version
node --version
npm --version
git --version
```

---

### 2. Clone the Repository

Open PowerShell and run:

```powershell
git clone https://github.com/rvtanishq/industrial-ppe-monitoring.git
```

Then enter the project directory:

```powershell
cd industrial-ppe-monitoring
```

---

### 3. Create the Python Virtual Environment

From the project root:

```powershell
python -m venv venv
```

Activate it:

```powershell
.\venv\Scripts\activate
```

You should see `(venv)` at the beginning of the terminal prompt.

---

### 4. Install Backend Dependencies

Run:

```powershell
pip install -r requirements.txt
```

The first installation may take some time because the project uses machine-learning libraries.

---

### 5. Verify the YOLO Model

Make sure the trained model exists at:

```text
models/best.pt
```

This model is required for PPE detection.

---

### 6. Start the Backend

Open **Terminal 1**.

Make sure you are in the project root:

```text
industrial-ppe-monitoring/
```

Activate the virtual environment:

```powershell
.\venv\Scripts\activate
```

Start the FastAPI backend:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Keep this terminal running.

A successful startup should display:

```text
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
```

---

### 7. Verify the Backend

Open:

```text
http://127.0.0.1:8000
```

The API should return a response similar to:

```json
{
  "name": "Industrial PPE Monitoring API",
  "version": "5.0.0",
  "status": "running",
  "architecture": "Browser Camera + FastAPI + YOLO + SQLite",
  "docs": "/docs"
}
```

FastAPI documentation is available at:

```text
http://127.0.0.1:8000/docs
```

---

### 8. Start the Frontend

Open **Terminal 2**.

Keep Terminal 1 running.

Navigate to the frontend:

```powershell
cd frontend
```

Install frontend dependencies:

```powershell
npm install
```

Then start the React development server:

```powershell
npm run dev
```

Vite will display a local URL, usually:

```text
http://localhost:5173
```

---

### 9. Open the Application

Open the URL provided by Vite:

```text
http://localhost:5173
```

Allow camera access when the browser asks for permission.

---

### 10. Start PPE Monitoring

Inside the dashboard:

1. Allow camera access.
2. Open the camera monitoring section.
3. Click **Start Monitoring**.
4. Wait for the live camera stream.
5. Stand in front of the camera.

The YOLO model will detect workers and PPE.

The system can identify:

```text
Person
Helmet
Gloves
Vest
Boots
Goggles
No Helmet
No Gloves
No Boots
No Goggles
```

---

### 11. Test PPE Violation Detection

When a worker is detected, the system checks PPE compliance.

For example:

```text
Worker: Person-1

Helmet       ✓
Gloves       ✗
Vest         ✓
Boots        ✗
Goggles      ✗

Status: VIOLATION
```

The system can then:

* Display the detection on the camera.
* Identify missing PPE.
* Update the dashboard statistics.
* Activate the alarm.
* Store the violation in SQLite.

---

### 12. Check Monitoring Status

Open:

```text
http://127.0.0.1:8000/api/status
```

This displays the current monitoring state, including:

* Monitoring status
* Alarm status
* Number of workers
* Compliant workers
* Violating workers
* Missing PPE count
* Last update time

---

### 13. Check Violation History

Open:

```text
http://127.0.0.1:8000/api/violations
```

This displays the stored PPE violations.

Each record can contain:

```text
ID
Timestamp
Person ID
Missing PPE
Status
```

---

### 14. Export Violation Records

Use the violation download endpoint:

```text
http://127.0.0.1:8000/api/violations/download
```

This allows the recorded violations to be downloaded as an Excel file.

---

### 15. Stop the Application

When finished:

1. Click **Stop Monitoring** in the dashboard.
2. Make sure the alarm has stopped.
3. Stop the frontend by pressing:

```text
CTRL + C
```

in Terminal 2.

4. Stop the backend by pressing:

```text
CTRL + C
```

in Terminal 1.

---

## ⚡ Quick Start

After the initial installation, the project can be started using two terminals.

### Terminal 1 — Backend

From the project root:

```powershell
.\venv\Scripts\activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

Then open the URL shown by Vite, usually:

```text
http://localhost:5173
```

---

## 🛠️ Troubleshooting

### Port 8000 is already in use

If you see:

```text
[WinError 10048]
only one usage of each socket address
```

another backend process is already running.

Stop the existing process with:

```text
CTRL + C
```

Alternatively, find the process using:

```powershell
netstat -ano | findstr :8000
```

---

### `ModuleNotFoundError: No module named 'backend'`

Make sure the command is executed from the **project root**, not from inside the `backend` directory.

Correct:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

---

### Frontend does not start

Run:

```powershell
cd frontend
npm install
npm run dev
```

---

### Camera does not appear

Check:

* Browser camera permission.
* Webcam connection.
* Whether another application is using the webcam.
* Backend is running.
* Frontend is running.

Then refresh the browser.

---

### YOLO model does not load

Verify that:

```text
models/best.pt
```

exists and that the Python dependencies have been installed:

```powershell
pip install -r requirements.txt
```

---

## ⚠️ Local Deployment Note

This project currently runs locally.

The backend and frontend must both be running for the application to work.

The application is **not currently dependent on a paid cloud deployment**. Anyone who clones the repository can run it by following the instructions above.

For the best real-time YOLO performance, a computer with sufficient CPU/GPU resources is recommended.
