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