import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

const PPE_TYPES = [
  "helmet",
  "gloves",
  "vest",
  "boots",
  "goggles",
];

const VIOLATION_TYPES = [
  "no_helmet",
  "no_goggle",
  "no_gloves",
  "no_boots",
];

const VIOLATION_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#8b5cf6",
];

function App() {
  // ============================================================
  // STATE
  // ============================================================

  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [backendOnline, setBackendOnline] =
    useState(false);

  const [error, setError] = useState("");
  const [cameraError, setCameraError] =
    useState("");

  const [cameraActive, setCameraActive] =
    useState(false);

  const [monitoringStatus, setMonitoringStatus] =
    useState(null);

  const [lastRefresh, setLastRefresh] =
    useState(null);

  // ============================================================
  // CAMERA REFERENCES
  // ============================================================

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const streamRef = useRef(null);
  const websocketRef = useRef(null);
  const frameIntervalRef = useRef(null);

  // ============================================================
  // ALARM REFERENCES
  // ============================================================

  const alarmContextRef = useRef(null);
  const alarmOscillatorRef = useRef(null);
  const alarmGainRef = useRef(null);
  const alarmIntervalRef = useRef(null);

  // ============================================================
  // HELPERS
  // ============================================================

  const toNumber = (value, fallback = 0) => {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  };

  const getRecordValue = (
    record,
    keys,
    fallback = "-"
  ) => {
    for (const key of keys) {
      if (
        record &&
        record[key] !== undefined &&
        record[key] !== null &&
        record[key] !== ""
      ) {
        return record[key];
      }
    }

    return fallback;
  };

  const normalizePPEText = (value) => {
    if (
      value === null ||
      value === undefined
    ) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .flatMap((item) =>
          normalizePPEText(item)
        )
        .filter(Boolean);
    }

    if (
      typeof value === "object"
    ) {
      return Object.entries(value)
        .filter(([, enabled]) =>
          Boolean(enabled)
        )
        .map(([key]) => key);
    }

    return String(value)
      .toLowerCase()
      .replace(/[\[\]"']/g, "")
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  // ============================================================
  // FETCH DASHBOARD DATA
  // ============================================================

  const fetchDashboardData =
    useCallback(
      async (manualRefresh = false) => {
        try {
          if (manualRefresh) {
            setRefreshing(true);
          }

          setError("");

          const [
            statusResponse,
            dashboardResponse,
            violationsResponse,
          ] = await Promise.all([
            fetch(
              `${API_BASE_URL}/api/status`,
              {
                cache: "no-store",
              }
            ),

            fetch(
              `${API_BASE_URL}/api/dashboard`,
              {
                cache: "no-store",
              }
            ),

            fetch(
              `${API_BASE_URL}/api/violations`,
              {
                cache: "no-store",
              }
            ),
          ]);

          if (!statusResponse.ok) {
            throw new Error(
              "Failed to fetch monitoring status."
            );
          }

          if (!dashboardResponse.ok) {
            throw new Error(
              "Failed to fetch dashboard data."
            );
          }

          if (!violationsResponse.ok) {
            throw new Error(
              "Failed to fetch violation records."
            );
          }

          const statusData =
            await statusResponse.json();

          const dashboardData =
            await dashboardResponse.json();

          const violationsData =
            await violationsResponse.json();

          // ------------------------------------------------------
          // LIVE STATUS
          // ------------------------------------------------------

          setMonitoringStatus(
            statusData
          );

          // ------------------------------------------------------
          // VIOLATION RECORDS
          // ------------------------------------------------------

          const violationRecords =
            Array.isArray(
              violationsData?.violations
            )
              ? violationsData.violations
              : [];

          setRecords(
            violationRecords
          );

          // ------------------------------------------------------
          // DASHBOARD DATA
          // ------------------------------------------------------

          const liveData =
            dashboardData?.live ||
            statusData ||
            {};

          const historyData =
            dashboardData?.history ||
            {};

          const combinedStats = {
            ...liveData,

            total_violations:
              historyData.total_violations ??
              liveData.total_violations ??
              statusData.total_violations ??
              violationRecords.length ??
              0,

            workers_involved:
              historyData.workers_involved ??
              0,

            total_detections:
              liveData.workers ??
              liveData.total_detections ??
              0,
          };

          setStats(
            combinedStats
          );

          setBackendOnline(true);

          setLastRefresh(
            new Date()
          );
        } catch (err) {
          console.error(
            "Dashboard error:",
            err
          );

          setBackendOnline(false);

          setError(
            "Unable to connect to the backend. Make sure FastAPI is running on port 8000."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  // ============================================================
  // INITIAL LOAD + AUTO REFRESH
  // ============================================================

  useEffect(() => {
    fetchDashboardData(false);

    const interval =
      setInterval(() => {
        fetchDashboardData(false);
      }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchDashboardData]);

  // ============================================================
  // PPE BAR CHART
  // ============================================================

  const ppeChartData =
    useMemo(() => {
      return PPE_TYPES.map(
        (type) => {
          const count =
            stats?.[type] ??
            stats?.detections?.[type] ??
            stats?.ppe_counts?.[type] ??
            stats?.ppe?.[type] ??
            0;

          return {
            name:
              type.toUpperCase(),
            count:
              toNumber(count),
          };
        }
      );
    }, [stats]);

  // ============================================================
  // VIOLATION PIE CHART
  // ============================================================

  const violationChartData =
    useMemo(() => {
      const backendCounts =
        stats?.violation_counts ||
        stats?.violations ||
        {};

      const hasBackendDistribution =
        VIOLATION_TYPES.some(
          (type) =>
            backendCounts?.[type] !==
              undefined ||
            stats?.[type] !==
              undefined
        );

      // --------------------------------------------------------
      // USE BACKEND DISTRIBUTION IF AVAILABLE
      // --------------------------------------------------------

      if (
        hasBackendDistribution
      ) {
        return VIOLATION_TYPES.map(
          (type) => ({
            name: type
              .replace("no_", "")
              .toUpperCase(),

            count: toNumber(
              stats?.[type] ??
                backendCounts?.[
                  type
                ] ??
                0
            ),

            type,
          })
        );
      }

      // --------------------------------------------------------
      // OTHERWISE DERIVE FROM DATABASE RECORDS
      // --------------------------------------------------------

      const counts = {
        no_helmet: 0,
        no_goggle: 0,
        no_gloves: 0,
        no_boots: 0,
      };

      records.forEach(
        (record) => {
          const missingPPE =
            getRecordValue(
              record,
              [
                "missing_ppe",
                "Missing PPE",
                "missing",
                "violation",
                "violations",
              ],
              ""
            );

          const items =
            normalizePPEText(
              missingPPE
            );

          items.forEach(
            (item) => {
              const clean =
                item
                  .toLowerCase()
                  .replace(
                    /\s+/g,
                    "_"
                  );

              if (
                clean.includes(
                  "helmet"
                )
              ) {
                counts.no_helmet++;
              }

              if (
                clean.includes(
                  "goggle"
                )
              ) {
                counts.no_goggle++;
              }

              if (
                clean.includes(
                  "glove"
                )
              ) {
                counts.no_gloves++;
              }

              if (
                clean.includes(
                  "boot"
                )
              ) {
                counts.no_boots++;
              }
            }
          );
        }
      );

      return VIOLATION_TYPES.map(
        (type) => ({
          name: type
            .replace("no_", "")
            .toUpperCase(),

          count:
            counts[type],

          type,
        })
      );
    }, [stats, records]);

  // ============================================================
  // LIVE VALUES
  // ============================================================

  const currentWorkers =
    toNumber(
      monitoringStatus?.workers ??
        stats?.workers ??
        0
    );

  const currentCompliant =
    toNumber(
      monitoringStatus?.compliant ??
        0
    );

  const currentViolating =
    toNumber(
      monitoringStatus?.violating ??
        0
    );

  const currentMissingPPE =
    toNumber(
      monitoringStatus?.missing_ppe ??
        0
    );

  // ============================================================
  // HISTORICAL VALUES
  // ============================================================

  const totalDetections =
    toNumber(
      stats?.total_detections ??
        stats?.total_records ??
        stats?.total ??
        stats?.workers ??
        0
    );

  const totalViolations =
    toNumber(
      stats?.total_violations ??
        stats?.violations_total ??
        records.length ??
        0
    );

  // ============================================================
  // COMPLIANCE RATE
  // ============================================================

  const complianceRate =
    totalDetections > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((totalDetections -
              totalViolations) /
              totalDetections) *
              100
          )
        )
      : currentWorkers > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (currentCompliant /
              currentWorkers) *
              100
          )
        )
      : 0;

  // ============================================================
  // CONTINUOUS ALARM
  //
  // ONLY CURRENT LIVE VIOLATIONS
  // CONTROL THIS.
  //
  // Historical 940 violations DO NOT
  // activate this alarm.
  // ============================================================

  const startContinuousAlarm =
    useCallback(() => {
      // Already running
      if (
        alarmOscillatorRef.current
      ) {
        return;
      }

      try {
        const AudioContext =
          window.AudioContext ||
          window.webkitAudioContext;

        if (!AudioContext) {
          console.warn(
            "Web Audio API is not supported."
          );

          return;
        }

        // Create audio context
        if (
          !alarmContextRef.current
        ) {
          alarmContextRef.current =
            new AudioContext();
        }

        const audioContext =
          alarmContextRef.current;

        // Browser may suspend audio
        if (
          audioContext.state ===
          "suspended"
        ) {
          audioContext.resume();
        }

        // ------------------------------------------------------
        // OSCILLATOR
        // ------------------------------------------------------

        const oscillator =
          audioContext.createOscillator();

        // ------------------------------------------------------
        // GAIN
        // ------------------------------------------------------

        const gain =
          audioContext.createGain();

        oscillator.type =
          "square";

        oscillator.frequency.value =
          850;

        // Start almost silent.
        gain.gain.value =
          0.0001;

        oscillator.connect(
          gain
        );

        gain.connect(
          audioContext.destination
        );

        oscillator.start();

        alarmOscillatorRef.current =
          oscillator;

        alarmGainRef.current =
          gain;

        // ------------------------------------------------------
        // REPEATING BEEP
        //
        // Beep every 600ms.
        // No multi-second gaps.
        // ------------------------------------------------------

        const beep = () => {
          if (
            !alarmGainRef.current ||
            !alarmContextRef.current
          ) {
            return;
          }

          const now =
            alarmContextRef.current
              .currentTime;

          const currentGain =
            alarmGainRef.current;

          currentGain.gain.cancelScheduledValues(
            now
          );

          // Start beep
          currentGain.gain.setValueAtTime(
            0.0001,
            now
          );

          currentGain.gain.linearRampToValueAtTime(
            0.12,
            now + 0.025
          );

          // Short beep
          currentGain.gain.setValueAtTime(
            0.12,
            now + 0.18
          );

          // End beep
          currentGain.gain.linearRampToValueAtTime(
            0.0001,
            now + 0.22
          );
        };

        // First beep immediately
        beep();

        // Repeat rapidly
        alarmIntervalRef.current =
          setInterval(
            beep,
            600
          );
      } catch (error) {
        console.error(
          "Could not start alarm:",
          error
        );
      }
    }, []);

  // ============================================================
  // STOP ALARM
  // ============================================================

  const stopContinuousAlarm =
    useCallback(() => {
      // Stop beep interval
      if (
        alarmIntervalRef.current
      ) {
        clearInterval(
          alarmIntervalRef.current
        );

        alarmIntervalRef.current =
          null;
      }

      // Stop oscillator
      if (
        alarmOscillatorRef.current
      ) {
        try {
          alarmOscillatorRef.current.stop();
        } catch {}

        try {
          alarmOscillatorRef.current.disconnect();
        } catch {}

        alarmOscillatorRef.current =
          null;
      }

      // Disconnect gain
      if (
        alarmGainRef.current
      ) {
        try {
          alarmGainRef.current.disconnect();
        } catch {}

        alarmGainRef.current =
          null;
      }
    }, []);

  // ============================================================
  // ALARM STATE CONTROLLER
  //
  // ONLY:
  //
  // cameraActive === true
  // AND
  // violating > 0
  //
  // means alarm.
  // ============================================================

  useEffect(() => {
    const violating =
      Number(
        monitoringStatus?.violating ??
          0
      );

    if (
      cameraActive &&
      violating > 0
    ) {
      startContinuousAlarm();
    } else {
      stopContinuousAlarm();
    }

    return () => {
      stopContinuousAlarm();
    };
  }, [
    cameraActive,
    monitoringStatus?.violating,
    startContinuousAlarm,
    stopContinuousAlarm,
  ]);

  // ============================================================
  // STOP ALARM ON PAGE REFRESH / CLOSE
  // ============================================================

  useEffect(() => {
    const handleBeforeUnload =
      () => {
        stopContinuousAlarm();
      };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );

      stopContinuousAlarm();
    };
  }, [
    stopContinuousAlarm,
  ]);

  // ============================================================
  // DOWNLOAD EXCEL
  // ============================================================

  const downloadExcel =
    () => {
      window.open(
        `${API_BASE_URL}/api/violations/download`,
        "_blank"
      );
    };

  // ============================================================
  // START CAMERA
  // ============================================================

  const startCamera =
    async () => {
      try {
        setCameraError("");

        // ------------------------------------------------------
        // Request camera
        // ------------------------------------------------------

        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices
            .getUserMedia
        ) {
          throw new Error(
            "Your browser does not support camera access."
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                width: {
                  ideal: 1280,
                },

                height: {
                  ideal: 720,
                },

                facingMode:
                  "user",
              },

              audio: false,
            }
          );

        streamRef.current =
          stream;

        const video =
          videoRef.current;

        if (!video) {
          throw new Error(
            "Camera video element not found."
          );
        }

        video.srcObject =
          stream;

        await video.play();

        setCameraActive(
          true
        );

        // ------------------------------------------------------
        // START BACKEND MONITORING
        // ------------------------------------------------------

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/api/monitoring/start`,
              {
                method: "POST",
              }
            );

          if (!response.ok) {
            throw new Error(
              "Failed to start backend monitoring."
            );
          }

          const data =
            await response.json();

          if (
            data?.status
          ) {
            setMonitoringStatus(
              data.status
            );
          }
        } catch (err) {
          console.error(
            "Backend monitoring error:",
            err
          );
        }

        // ------------------------------------------------------
        // CONNECT WEBSOCKET
        // ------------------------------------------------------

        connectWebSocket();
      } catch (err) {
        console.error(
          "Camera error:",
          err
        );

        setCameraActive(
          false
        );

        setCameraError(
          err.message ||
            "Unable to access the camera."
        );
      }
    };

  // ============================================================
  // CONNECT WEBSOCKET
  // ============================================================

  const connectWebSocket =
    () => {
      if (
        websocketRef.current
      ) {
        try {
          websocketRef.current.close();
        } catch {}
      }

      const websocket =
        new WebSocket(
          "ws://127.0.0.1:8000/ws/camera"
        );

      websocketRef.current =
        websocket;

      websocket.onopen =
        () => {
          console.log(
            "WebSocket connected."
          );

          websocket.send(
            JSON.stringify({
              type: "start",
            })
          );

          startSendingFrames();
        };

      websocket.onmessage =
        (event) => {
          try {
            const message =
              JSON.parse(
                event.data
              );

            // --------------------------------------------------
            // STATUS
            // --------------------------------------------------

            if (
              message.type ===
              "status"
            ) {
              if (
                message.status
              ) {
                setMonitoringStatus(
                  message.status
                );
              }

              return;
            }

            // --------------------------------------------------
            // YOLO RESULT
            // --------------------------------------------------

            if (
              message.type ===
              "result"
            ) {
              if (
                message.status
              ) {
                setMonitoringStatus(
                  message.status
                );
              }

              if (
                message.image
              ) {
                displayProcessedFrame(
                  message.image
                );
              }

              return;
            }
          } catch (err) {
            console.error(
              "WebSocket message error:",
              err
            );
          }
        };

      websocket.onerror =
        (error) => {
          console.error(
            "WebSocket error:",
            error
          );
        };

      websocket.onclose =
        () => {
          console.log(
            "WebSocket disconnected."
          );

          stopSendingFrames();
        };
    };

  // ============================================================
  // START SENDING FRAMES
  // ============================================================

  const startSendingFrames =
    () => {
      stopSendingFrames();

      // 250ms = 4 FPS
      //
      // This is slightly lighter than
      // sending 5 FPS continuously.
      frameIntervalRef.current =
        setInterval(
          () => {
            sendCurrentFrame();
          },
          250
        );
    };

  // ============================================================
  // STOP SENDING FRAMES
  // ============================================================

  const stopSendingFrames =
    () => {
      if (
        frameIntervalRef.current
      ) {
        clearInterval(
          frameIntervalRef.current
        );

        frameIntervalRef.current =
          null;
      }
    };

  // ============================================================
  // SEND CURRENT FRAME
  // ============================================================

  const sendCurrentFrame =
    () => {
      const video =
        videoRef.current;

      const websocket =
        websocketRef.current;

      if (!video) {
        return;
      }

      if (!websocket) {
        return;
      }

      if (
        websocket.readyState !==
        WebSocket.OPEN
      ) {
        return;
      }

      if (
        video.readyState < 2
      ) {
        return;
      }

      if (
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      const captureCanvas =
        document.createElement(
          "canvas"
        );

      captureCanvas.width =
        video.videoWidth;

      captureCanvas.height =
        video.videoHeight;

      const context =
        captureCanvas.getContext(
          "2d"
        );

      if (!context) {
        return;
      }

      context.drawImage(
        video,
        0,
        0,
        captureCanvas.width,
        captureCanvas.height
      );

      const imageData =
        captureCanvas.toDataURL(
          "image/jpeg",
          0.65
        );

      try {
        websocket.send(
          JSON.stringify({
            type: "frame",
            image: imageData,
          })
        );
      } catch (err) {
        console.error(
          "Frame sending error:",
          err
        );
      }
    };

  // ============================================================
  // DISPLAY YOLO FRAME
  // ============================================================

  const displayProcessedFrame =
    (base64Image) => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return;
      }

      const image =
        new Image();

      image.onload =
        () => {
          canvas.width =
            image.width;

          canvas.height =
            image.height;

          const context =
            canvas.getContext(
              "2d"
            );

          if (!context) {
            return;
          }

          context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          context.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
          );
        };

      image.onerror =
        () => {
          console.error(
            "Could not load YOLO image."
          );
        };

      image.src =
        `data:image/jpeg;base64,${base64Image}`;
    };

  // ============================================================
  // STOP CAMERA
  // ============================================================

  const stopCamera =
    async () => {
      console.log(
        "Stopping camera..."
      );

      // IMPORTANT:
      // Stop browser alarm immediately.
      stopContinuousAlarm();

      // Stop frame loop
      stopSendingFrames();

      // --------------------------------------------------------
      // Tell WebSocket to stop
      // --------------------------------------------------------

      if (
        websocketRef.current &&
        websocketRef.current
          .readyState ===
          WebSocket.OPEN
      ) {
        try {
          websocketRef.current.send(
            JSON.stringify({
              type: "stop",
            })
          );
        } catch {}
      }

      // --------------------------------------------------------
      // Close WebSocket
      // --------------------------------------------------------

      if (
        websocketRef.current
      ) {
        try {
          websocketRef.current.close();
        } catch {}

        websocketRef.current =
          null;
      }

      // --------------------------------------------------------
      // Stop camera tracks
      // --------------------------------------------------------

      if (
        streamRef.current
      ) {
        streamRef.current
          .getTracks()
          .forEach(
            (track) => {
              track.stop();
            }
          );

        streamRef.current =
          null;
      }

      // --------------------------------------------------------
      // Clear video
      // --------------------------------------------------------

      if (
        videoRef.current
      ) {
        videoRef.current.srcObject =
          null;
      }

      // --------------------------------------------------------
      // Clear YOLO canvas
      // --------------------------------------------------------

      if (
        canvasRef.current
      ) {
        const canvas =
          canvasRef.current;

        const context =
          canvas.getContext(
            "2d"
          );

        if (context) {
          context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
          );
        }
      }

      // --------------------------------------------------------
      // Tell backend to stop
      // --------------------------------------------------------

      try {
        await fetch(
          `${API_BASE_URL}/api/monitoring/stop`,
          {
            method: "POST",
          }
        );
      } catch (err) {
        console.error(
          "Backend stop error:",
          err
        );
      }

      // --------------------------------------------------------
      // Reset frontend state
      // --------------------------------------------------------

      setCameraActive(
        false
      );

      setMonitoringStatus(
        (previous) => ({
          ...(previous || {}),
          monitoring: false,
          alarm: false,
          workers: 0,
          compliant: 0,
          violating: 0,
          missing_ppe: 0,
        })
      );

      setTimeout(() => {
        fetchDashboardData(
          false
        );
      }, 300);
    };

  // ============================================================
  // COMPLETE CLEANUP
  // ============================================================

  useEffect(() => {
    return () => {
      stopContinuousAlarm();

      stopSendingFrames();

      if (
        websocketRef.current
      ) {
        try {
          websocketRef.current.close();
        } catch {}
      }

      if (
        streamRef.current
      ) {
        streamRef.current
          .getTracks()
          .forEach(
            (track) => {
              track.stop();
            }
          );
      }
    };
  }, []);

  // ============================================================
  // LAST UPDATE
  // ============================================================

  const lastUpdateText =
    lastRefresh
      ? lastRefresh.toLocaleTimeString()
      : "Waiting...";

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="app">

      {/* ======================================================
          TOP BAR
      ====================================================== */}

      <header className="topbar">

        <div>
          <h1>
            🛡 Industrial PPE Monitoring
          </h1>

          <p>
            AI-powered workplace safety
            intelligence
          </p>
        </div>

        <div className="connection-status">

          <span
            className={`status-dot ${
              backendOnline
                ? "online"
                : "offline"
            }`}
          />

          {backendOnline
            ? "Backend Online"
            : "Backend Offline"}

        </div>

      </header>

      <main className="dashboard">

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (
          <div className="error-banner">
            <strong>
              Backend connection problem:
            </strong>{" "}
            {error}
          </div>
        )}

        {cameraError && (
          <div className="error-banner">
            <strong>
              Camera problem:
            </strong>{" "}
            {cameraError}
          </div>
        )}

        {/* ====================================================
            HERO
        ==================================================== */}

        <section className="hero-card">

          <div>

            <span className="eyebrow">
              REAL-TIME SAFETY MONITORING
            </span>

            <h2>
              Industrial Workplace
              <br />
              Safety Intelligence
            </h2>

            <p>
              Detect PPE compliance,
              identify workplace safety
              violations and monitor
              workers in real time using
              computer vision and YOLO.
            </p>

          </div>

          <div className="hero-status">

            <div className="camera-icon">
              ◉
            </div>

            <span>
              Monitoring System
            </span>

            <strong>
              {cameraActive
                ? "ACTIVE"
                : "STANDBY"}
            </strong>

            <span>
              Last update:{" "}
              {lastUpdateText}
            </span>

          </div>

        </section>

        {/* ====================================================
            CAMERA
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Live PPE Camera
              </h3>

              <p>
                Real-time YOLO object detection
              </p>

            </div>

            <strong
              style={{
                color:
                  cameraActive
                    ? "#22c55e"
                    : "#ef4444",
              }}
            >
              {cameraActive
                ? "● LIVE"
                : "○ OFFLINE"}
            </strong>

          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom:
                "20px",
              flexWrap:
                "wrap",
            }}
          >

            <button
              className="download-button"
              onClick={
                cameraActive
                  ? stopCamera
                  : startCamera
              }
            >
              {cameraActive
                ? "■ Stop Monitoring"
                : "▶ Start Monitoring"}
            </button>

            <button
              className="refresh-button"
              onClick={() =>
                fetchDashboardData(
                  true
                )
              }
              disabled={
                refreshing
              }
            >
              {refreshing
                ? "⟳ Refreshing..."
                : "↻ Refresh"}
            </button>

          </div>

          {/* CAMERA VIEW */}

          <div
            style={{
              width: "100%",
              minHeight:
                "450px",
              background:
                "linear-gradient(145deg,#020617,#0f172a)",
              borderRadius:
                "18px",
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              overflow:
                "hidden",
              position:
                "relative",
              border:
                "1px solid rgba(56,189,248,.15)",
              boxShadow:
                "inset 0 0 50px rgba(0,0,0,.35)",
            }}
          >

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                position:
                  "absolute",
                width: "1px",
                height: "1px",
                opacity: 0,
                pointerEvents:
                  "none",
              }}
            />

            <canvas
              ref={canvasRef}
              style={{
                display:
                  cameraActive
                    ? "block"
                    : "none",

                width:
                  "100%",

                maxHeight:
                  "650px",

                objectFit:
                  "contain",

                borderRadius:
                  "18px",
              }}
            />

            {!cameraActive && (
              <div
                style={{
                  color:
                    "#64748b",
                  textAlign:
                    "center",
                  padding:
                    "50px",
                }}
              >

                <div
                  style={{
                    fontSize:
                      "64px",
                    marginBottom:
                      "15px",
                  }}
                >
                  📷
                </div>

                <h3
                  style={{
                    color:
                      "#e2e8f0",
                  }}
                >
                  Camera Offline
                </h3>

                <p>
                  Start monitoring
                  to activate
                  real-time PPE
                  detection.
                </p>

              </div>
            )}

          </div>

        </section>

        {/* ====================================================
            STATISTICS
        ==================================================== */}

        <section className="stats-grid">

          <StatCard
            title="Workers Detected"
            value={
              loading
                ? "..."
                : currentWorkers
            }
            description="Current camera detection"
            icon="👤"
          />

          <StatCard
            title="Safety Violations"
            value={
              loading
                ? "..."
                : totalViolations
            }
            description="Violations recorded"
            icon="!"
            danger
          />

          <StatCard
            title="Compliance Rate"
            value={
              loading
                ? "..."
                : `${complianceRate.toFixed(
                    1
                  )}%`
            }
            description="Estimated PPE compliance"
            icon="%"
            success
          />

          <StatCard
            title="Missing PPE"
            value={
              loading
                ? "..."
                : currentMissingPPE
            }
            description="Currently missing equipment"
            icon="⚠"
            danger
          />

        </section>

        {/* ====================================================
            LIVE STATUS
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Live Monitoring Status
              </h3>

              <p>
                Current safety state
                from YOLO
              </p>

            </div>

            <span
              className={`status-badge ${
                cameraActive
                  ? "safe"
                  : "violation"
              }`}
            >
              {cameraActive
                ? "MONITORING"
                : "STANDBY"}
            </span>

          </div>

          <div className="ppe-grid">

            <StatusCard
              icon="👤"
              title="Workers"
              value={
                currentWorkers
              }
            />

            <StatusCard
              icon="✓"
              title="Compliant"
              value={
                currentCompliant
              }
            />

            <StatusCard
              icon="!"
              title="Violating"
              value={
                currentViolating
              }
              danger
            />

            <StatusCard
              icon="⚠"
              title="Missing PPE"
              value={
                currentMissingPPE
              }
              danger
            />

            <StatusCard
              icon="🔊"
              title="Alarm"
              value={
                monitoringStatus?.alarm
                  ? "ACTIVE"
                  : "OFF"
              }
              danger={
                Boolean(
                  monitoringStatus?.alarm
                )
              }
            />

          </div>

        </section>

        {/* ====================================================
            CHARTS
        ==================================================== */}

        <section className="charts-grid">

          {/* PPE CHART */}

          <div className="panel">

            <div className="panel-header">

              <div>

                <h3>
                  PPE Detection Overview
                </h3>

                <p>
                  Detected protective equipment
                </p>

              </div>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    ppeChartData
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,.12)"
                  />

                  <XAxis
                    dataKey="name"
                    tick={{
                      fill:
                        "#94a3b8",
                      fontSize:
                        10,
                    }}
                  />

                  <YAxis
                    allowDecimals={
                      false
                    }
                    tick={{
                      fill:
                        "#94a3b8",
                      fontSize:
                        10,
                    }}
                  />

                  <Tooltip
                    contentStyle={{
                      background:
                        "#0f172a",
                      border:
                        "1px solid rgba(56,189,248,.2)",
                      borderRadius:
                        "12px",
                      color:
                        "#f8fafc",
                    }}
                  />

                  <Legend />

                  <Bar
                    dataKey="count"
                    name="Detections"
                    fill="#38bdf8"
                    radius={[
                      8,
                      8,
                      2,
                      2,
                    ]}
                    animationDuration={
                      900
                    }
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>

          {/* VIOLATION CHART */}

          <div className="panel">

            <div className="panel-header">

              <div>

                <h3>
                  Violation Distribution
                </h3>

                <p>
                  PPE violations detected
                </p>

              </div>

              <span className="status-badge violation">

                {violationChartData.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.count,
                  0
                )}{" "}
                TOTAL

              </span>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <PieChart>

                  <Pie
                    data={
                      violationChartData.filter(
                        (
                          item
                        ) =>
                          item.count >
                          0
                      )
                    }
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={
                      105
                    }
                    innerRadius={
                      58
                    }
                    paddingAngle={
                      4
                    }
                    label
                    animationDuration={
                      1000
                    }
                  >

                    {violationChartData
                      .filter(
                        (
                          item
                        ) =>
                          item.count >
                          0
                      )
                      .map(
                        (
                          entry,
                          index
                        ) => (
                          <Cell
                            key={
                              entry.type
                            }
                            fill={
                              VIOLATION_COLORS[
                                index %
                                  VIOLATION_COLORS.length
                              ]
                            }
                            stroke="transparent"
                          />
                        )
                      )}

                  </Pie>

                  <Tooltip
                    contentStyle={{
                      background:
                        "#0f172a",
                      border:
                        "1px solid rgba(56,189,248,.2)",
                      borderRadius:
                        "12px",
                      color:
                        "#f8fafc",
                    }}
                  />

                  <Legend />

                </PieChart>

              </ResponsiveContainer>

            </div>

            {violationChartData.every(
              (item) =>
                item.count ===
                0
            ) && (
              <div
                style={{
                  textAlign:
                    "center",
                  color:
                    "#64748b",
                  fontSize:
                    "12px",
                  marginTop:
                    "-35px",
                }}
              >
                No violation
                distribution
                available yet.
              </div>
            )}

          </div>

        </section>

        {/* ====================================================
            PPE STATUS
        ==================================================== */}

        <section className="panel ppe-status-panel">

          <div className="panel-header">

            <div>

              <h3>
                PPE Equipment Status
              </h3>

              <p>
                Current detection statistics
              </p>

            </div>

          </div>

          <div className="ppe-grid">

            {ppeChartData.map(
              (item) => (
                <div
                  className="ppe-card"
                  key={
                    item.name
                  }
                >

                  <div className="ppe-card-icon">
                    ✓
                  </div>

                  <div>

                    <span>
                      {item.name}
                    </span>

                    <strong>
                      {item.count}
                    </strong>

                  </div>

                </div>
              )
            )}

          </div>

        </section>

        {/* ====================================================
            VIOLATION BREAKDOWN
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Safety Violation Breakdown
              </h3>

              <p>
                Individual PPE violation
                counts
              </p>

            </div>

          </div>

          <div className="ppe-grid">

            {violationChartData.map(
              (
                item
              ) => (
                <div
                  className="ppe-card"
                  key={
                    item.type
                  }
                  style={{
                    borderColor:
                      item.count >
                      0
                        ? "rgba(239,68,68,.25)"
                        : undefined,
                  }}
                >

                  <div
                    className="ppe-card-icon"
                    style={{
                      background:
                        item.count >
                        0
                          ? "rgba(239,68,68,.12)"
                          : undefined,

                      color:
                        item.count >
                        0
                          ? "#f87171"
                          : undefined,
                    }}
                  >
                    {item.count >
                    0
                      ? "!"
                      : "✓"}
                  </div>

                  <div>

                    <span>
                      {
                        item.name
                      }
                    </span>

                    <strong>
                      {
                        item.count
                      }
                    </strong>

                  </div>

                </div>
              )
            )}

          </div>

        </section>

        {/* ====================================================
            RECORDS
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Recent Monitoring Records
              </h3>

              <p>
                Latest PPE violations
                stored in database
              </p>

            </div>

            <div className="panel-actions">

              <button
                className="refresh-button"
                onClick={() =>
                  fetchDashboardData(
                    true
                  )
                }
                disabled={
                  refreshing
                }
              >
                {refreshing
                  ? "⟳ Refreshing..."
                  : "↻ Refresh"}
              </button>

              <button
                className="download-button"
                onClick={
                  downloadExcel
                }
              >
                ↓ Download Excel
              </button>

            </div>

          </div>

          <div className="table-wrapper">

            <table>

              <thead>

                <tr>
                  <th>
                    ID
                  </th>

                  <th>
                    Timestamp
                  </th>

                  <th>
                    Person ID
                  </th>

                  <th>
                    Missing PPE
                  </th>

                  <th>
                    Status
                  </th>
                </tr>

              </thead>

              <tbody>

                {records.length ===
                0 ? (
                  <tr>

                    <td
                      colSpan="5"
                      className="empty-state"
                    >
                      No monitoring
                      records
                      available.
                    </td>

                  </tr>
                ) : (
                  records
                    .slice(
                      0,
                      20
                    )
                    .map(
                      (
                        record,
                        index
                      ) => {
                        const id =
                          getRecordValue(
                            record,
                            [
                              "id",
                              "ID",
                            ],
                            index +
                              1
                          );

                        const timestamp =
                          getRecordValue(
                            record,
                            [
                              "timestamp",
                              "Timestamp",
                            ]
                          );

                        const personId =
                          getRecordValue(
                            record,
                            [
                              "person_id",
                              "Person ID",
                            ]
                          );

                        const missingPPE =
                          getRecordValue(
                            record,
                            [
                              "missing_ppe",
                              "Missing PPE",
                            ]
                          );

                        const status =
                          getRecordValue(
                            record,
                            [
                              "status",
                              "Status",
                            ]
                          );

                        const isViolation =
                          String(
                            status
                          )
                            .toLowerCase()
                            .includes(
                              "violation"
                            ) ||
                          normalizePPEText(
                            missingPPE
                          ).length >
                            0;

                        return (
                          <tr
                            key={`${id}-${index}`}
                          >

                            <td>
                              {id}
                            </td>

                            <td>
                              {
                                timestamp
                              }
                            </td>

                            <td>
                              {
                                personId
                              }
                            </td>

                            <td>

                              <span className="detection-label">
                                {String(
                                  missingPPE
                                ).replaceAll(
                                  "_",
                                  " "
                                )}
                              </span>

                            </td>

                            <td>

                              <span
                                className={`status-badge ${
                                  isViolation
                                    ? "violation"
                                    : "safe"
                                }`}
                              >
                                {isViolation
                                  ? "VIOLATION"
                                  : status}
                              </span>

                            </td>

                          </tr>
                        );
                      }
                    )
                )}

              </tbody>

            </table>

          </div>

        </section>

        {/* ====================================================
            SYSTEM INFO
        ==================================================== */}

        <section className="system-info">

          <div>
            <span>
              AI MODEL
            </span>

            <strong>
              YOLO PPE Detection
            </strong>
          </div>

          <div>
            <span>
              BACKEND
            </span>

            <strong>
              FastAPI
            </strong>
          </div>

          <div>
            <span>
              DATABASE
            </span>

            <strong>
              SQLite
            </strong>
          </div>

          <div>
            <span>
              FRONTEND
            </span>

            <strong>
              React + Vite
            </strong>
          </div>

        </section>

      </main>

      <footer>
        Industrial PPE Monitoring System
        {" • "}
        AI-powered workplace safety
      </footer>

    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  title,
  value,
  description,
  icon,
  danger = false,
  success = false,
}) {
  return (
    <div
      className={`stat-card ${
        danger
          ? "danger"
          : ""
      } ${
        success
          ? "success"
          : ""
      }`}
    >

      <div className="stat-icon">
        {icon}
      </div>

      <div className="stat-content">

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

        <small>
          {description}
        </small>

      </div>

    </div>
  );
}

// ============================================================
// STATUS CARD
// ============================================================

function StatusCard({
  icon,
  title,
  value,
  danger = false,
}) {
  return (
    <div
      className="ppe-card"
      style={{
        borderColor:
          danger &&
          value !== 0
            ? "rgba(239,68,68,.25)"
            : undefined,
      }}
    >

      <div
        className="ppe-card-icon"
        style={{
          background:
            danger &&
            value !== 0
              ? "rgba(239,68,68,.12)"
              : undefined,

          color:
            danger &&
            value !== 0
              ? "#f87171"
              : undefined,
        }}
      >
        {icon}
      </div>

      <div>

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  );
}

export default App;