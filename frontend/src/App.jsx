import { useEffect, useMemo, useRef, useState } from "react";
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

function App() {
  // ============================================================
  // STATE
  // ============================================================

  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);

  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  const [error, setError] = useState("");

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [monitoringStatus, setMonitoringStatus] =
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
  // FETCH DASHBOARD DATA
  // ============================================================

  const fetchDashboardData = async () => {
    try {
      setError("");

      const [
        statusResponse,
        dashboardResponse,
        violationsResponse,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status`),
        fetch(`${API_BASE_URL}/api/dashboard`),
        fetch(`${API_BASE_URL}/api/violations`),
      ]);

      if (!statusResponse.ok) {
        throw new Error("Failed to fetch status");
      }

      if (!dashboardResponse.ok) {
        throw new Error("Failed to fetch dashboard");
      }

      if (!violationsResponse.ok) {
        throw new Error("Failed to fetch violations");
      }

      const statusData =
        await statusResponse.json();

      const dashboardData =
        await dashboardResponse.json();

      const violationsData =
        await violationsResponse.json();

      setMonitoringStatus(statusData);

      /*
       * Backend /api/dashboard structure:
       *
       * {
       *   live: {...},
       *   history: {...}
       * }
       */

      const liveData =
        dashboardData?.live || statusData || {};

      const historyData =
        dashboardData?.history || {};

      const combinedStats = {
        ...liveData,

        total_violations:
          historyData.total_violations ?? 0,

        workers_involved:
          historyData.workers_involved ?? 0,

        total_detections:
          liveData.workers ?? 0,
      };

      setStats(combinedStats);

      if (
        Array.isArray(
          violationsData?.violations
        )
      ) {
        setRecords(
          violationsData.violations
        );
      } else {
        setRecords([]);
      }

      setBackendOnline(true);

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
    }
  };

  // ============================================================
  // INITIAL LOAD + AUTO REFRESH
  // ============================================================

  useEffect(() => {
    fetchDashboardData();

    const interval =
      setInterval(() => {
        fetchDashboardData();
      }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ============================================================
  // PPE CHART
  // ============================================================

  const ppeChartData = useMemo(() => {
    return PPE_TYPES.map((type) => ({
      name: type.toUpperCase(),

      count: Number(
        stats?.[type] ??
          stats?.detections?.[type] ??
          stats?.ppe_counts?.[type] ??
          0
      ),
    }));
  }, [stats]);

  // ============================================================
  // VIOLATION CHART
  // ============================================================

  const violationChartData = useMemo(() => {
    return VIOLATION_TYPES.map((type) => ({
      name: type
        .replace("no_", "")
        .toUpperCase(),

      count: Number(
        stats?.[type] ??
          stats?.violations?.[type] ??
          stats?.violation_counts?.[type] ??
          0
      ),
    }));
  }, [stats]);

  // ============================================================
  // TOTAL DETECTIONS
  // ============================================================

  const totalDetections = Number(
    stats?.total_detections ??
      stats?.total_records ??
      stats?.total ??
      stats?.workers ??
      0
  );

  // ============================================================
  // TOTAL VIOLATIONS
  // ============================================================

  const totalViolations = Number(
    stats?.total_violations ??
      stats?.violations_total ??
      0
  );

  // ============================================================
  // COMPLIANCE
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
      : 0;

  // ============================================================
  // DOWNLOAD EXCEL
  // ============================================================

  const downloadExcel = () => {
    window.open(
      `${API_BASE_URL}/api/violations/download`,
      "_blank"
    );
  };

  // ============================================================
  // GET RECORD VALUE
  // ============================================================

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

  // ============================================================
  // START CAMERA
  // ============================================================

  const startCamera = async () => {
    try {
      setCameraError("");

      // --------------------------------------------------------
      // CHECK BROWSER CAMERA SUPPORT
      // --------------------------------------------------------

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Your browser does not support camera access."
        );
      }

      // --------------------------------------------------------
      // REQUEST CAMERA
      // --------------------------------------------------------

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            width: {
              ideal: 1280,
            },

            height: {
              ideal: 720,
            },

            facingMode: "user",
          },

          audio: false,
        });

      streamRef.current = stream;

      // --------------------------------------------------------
      // CONNECT VIDEO
      // --------------------------------------------------------

      const video =
        videoRef.current;

      if (!video) {
        throw new Error(
          "Camera video element not found."
        );
      }

      video.srcObject = stream;

      await video.play();

      setCameraActive(true);

      console.log(
        "Browser camera started."
      );

      // --------------------------------------------------------
      // START BACKEND MONITORING
      // --------------------------------------------------------

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

        console.log(
          "Backend monitoring:",
          data
        );
      } catch (err) {
        console.error(
          "Backend monitoring error:",
          err
        );
      }

      // --------------------------------------------------------
      // CONNECT WEBSOCKET
      // --------------------------------------------------------

      connectWebSocket();

    } catch (err) {
      console.error(
        "Camera error:",
        err
      );

      setCameraActive(false);

      setCameraError(
        err.message ||
          "Unable to access the camera."
      );
    }
  };

  // ============================================================
  // CONNECT WEBSOCKET
  // ============================================================

  const connectWebSocket = () => {
    // Close old socket first

    if (
      websocketRef.current
    ) {
      try {
        websocketRef.current.close();
      } catch (err) {
        console.error(err);
      }
    }

    const websocketUrl =
      "ws://127.0.0.1:8000/ws/camera";

    console.log(
      "Connecting WebSocket:",
      websocketUrl
    );

    const websocket =
      new WebSocket(
        websocketUrl
      );

    websocketRef.current =
      websocket;

    // ----------------------------------------------------------
    // OPEN
    // ----------------------------------------------------------

    websocket.onopen = () => {
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

    // ----------------------------------------------------------
    // MESSAGE
    // ----------------------------------------------------------

    websocket.onmessage = (
      event
    ) => {
      try {
        const message =
          JSON.parse(
            event.data
          );

        console.log(
          "WebSocket message:",
          message.type
        );

        // ------------------------------------------------------
        // STATUS
        // ------------------------------------------------------

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

        // ------------------------------------------------------
        // YOLO RESULT
        // ------------------------------------------------------

        if (
          message.type ===
          "result"
        ) {
          // Update status

          if (
            message.status
          ) {
            setMonitoringStatus(
              message.status
            );
          }

          // Draw processed YOLO frame

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
          "WebSocket message parsing error:",
          err
        );
      }
    };

    // ----------------------------------------------------------
    // ERROR
    // ----------------------------------------------------------

    websocket.onerror = (
      error
    ) => {
      console.error(
        "WebSocket error:",
        error
      );
    };

    // ----------------------------------------------------------
    // CLOSE
    // ----------------------------------------------------------

    websocket.onclose = () => {
      console.log(
        "WebSocket disconnected."
      );

      stopSendingFrames();
    };
  };

  // ============================================================
  // SEND CAMERA FRAMES
  // ============================================================

  const startSendingFrames = () => {
    stopSendingFrames();

    frameIntervalRef.current =
      setInterval(() => {
        sendCurrentFrame();
      }, 200);
  };

  // ============================================================
  // STOP FRAME SENDING
  // ============================================================

  const stopSendingFrames = () => {
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
  // CAPTURE CURRENT CAMERA FRAME
  // ============================================================

  const sendCurrentFrame = () => {
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
      video.readyState <
      2
    ) {
      return;
    }

    if (
      video.videoWidth ===
        0 ||
      video.videoHeight ===
        0
    ) {
      return;
    }

    // ----------------------------------------------------------
    // TEMPORARY CAPTURE CANVAS
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // CONVERT TO JPEG
    // ----------------------------------------------------------

    const imageData =
      captureCanvas.toDataURL(
        "image/jpeg",
        0.70
      );

    // ----------------------------------------------------------
    // SEND TO FASTAPI
    // ----------------------------------------------------------

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
  // DISPLAY YOLO PROCESSED FRAME
  // ============================================================

  const displayProcessedFrame = (
    base64Image
  ) => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const image =
      new Image();

    image.onload = () => {
      // --------------------------------------------------------
      // SET CANVAS TO ORIGINAL YOLO IMAGE SIZE
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // CLEAR OLD FRAME
      // --------------------------------------------------------

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      // --------------------------------------------------------
      // DRAW YOLO FRAME
      // --------------------------------------------------------

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };

    image.onerror = () => {
      console.error(
        "Could not load processed YOLO image."
      );
    };

    image.src =
      `data:image/jpeg;base64,${base64Image}`;
  };

  // ============================================================
  // STOP CAMERA
  // ============================================================

  const stopCamera = async () => {
    console.log(
      "Stopping camera..."
    );

    // ----------------------------------------------------------
    // STOP FRAME LOOP
    // ----------------------------------------------------------

    stopSendingFrames();

    // ----------------------------------------------------------
    // SEND STOP TO WEBSOCKET
    // ----------------------------------------------------------

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {
      try {
        websocketRef.current.send(
          JSON.stringify({
            type: "stop",
          })
        );
      } catch (err) {
        console.error(
          err
        );
      }
    }

    // ----------------------------------------------------------
    // CLOSE WEBSOCKET
    // ----------------------------------------------------------

    if (
      websocketRef.current
    ) {
      try {
        websocketRef.current.close();
      } catch (err) {
        console.error(
          err
        );
      }

      websocketRef.current =
        null;
    }

    // ----------------------------------------------------------
    // STOP CAMERA STREAM
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // CLEAR VIDEO
    // ----------------------------------------------------------

    if (
      videoRef.current
    ) {
      videoRef.current.srcObject =
        null;
    }

    // ----------------------------------------------------------
    // CLEAR CANVAS
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // BACKEND STOP
    // ----------------------------------------------------------

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

    setCameraActive(
      false
    );

    console.log(
      "Camera stopped."
    );

    fetchDashboardData();
  };

  // ============================================================
  // CLEANUP WHEN COMPONENT UNMOUNTS
  // ============================================================

  useEffect(() => {
    return () => {
      stopSendingFrames();

      if (
        websocketRef.current
      ) {
        try {
          websocketRef.current.close();
        } catch (err) {}
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
  // RETURN UI
  // ============================================================

  return (
    <div className="app">

      {/* ======================================================
          TOP BAR
      ====================================================== */}

      <header className="topbar">

        <div>

          <h1>
            Industrial PPE Monitoring
          </h1>

          <p>
            AI-powered Personal Protective
            Equipment monitoring system
          </p>

        </div>

        <div className="connection-status">

          <span
            className={`status-dot ${
              backendOnline
                ? "online"
                : "offline"
            }`}
          ></span>

          {backendOnline
            ? "Backend Online"
            : "Backend Offline"}

        </div>

      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

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

        {/* ====================================================
            CAMERA ERROR
        ==================================================== */}

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
              Monitor PPE compliance,
              identify safety violations,
              and maintain a centralized
              record of workplace safety
              events.
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
                : "OFFLINE"}
            </strong>

          </div>

        </section>

        {/* ====================================================
            CAMERA CONTROLS
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Live PPE Camera
              </h3>

              <p>
                Real-time YOLO PPE detection
              </p>

            </div>

            <div>

              <strong
                style={{
                  color:
                    cameraActive
                      ? "#16a34a"
                      : "#dc2626",
                }}
              >
                {cameraActive
                  ? "● LIVE"
                  : "○ OFFLINE"}
              </strong>

            </div>

          </div>

          {/* ==================================================
              CAMERA BUTTONS
          ================================================== */}

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >

            <button
              className="download-button"
              onClick={
                cameraActive
                  ? stopCamera
                  : startCamera
              }
              style={{
                cursor: "pointer",
              }}
            >
              {cameraActive
                ? "■ Stop Monitoring"
                : "▶ Start Monitoring"}
            </button>

            <button
              className="refresh-button"
              onClick={
                fetchDashboardData
              }
            >
              ↻ Refresh
            </button>

          </div>

          {/* ==================================================
              CAMERA DISPLAY
          ================================================== */}

          <div
            style={{
              width: "100%",
              minHeight: "450px",
              background:
                "#111827",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >

            {/* ================================================
                ORIGINAL CAMERA

                Hidden because it is only used as the
                frame source for YOLO.
            ================================================= */}

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

            {/* ================================================
                YOLO PROCESSED IMAGE

                THIS IS WHERE THE BOUNDING BOXES APPEAR.
            ================================================= */}

            <canvas
              ref={canvasRef}
              style={{
                display:
                  cameraActive
                    ? "block"
                    : "none",

                width: "100%",

                maxHeight:
                  "650px",

                objectFit:
                  "contain",

                borderRadius:
                  "12px",
              }}
            />

            {/* ================================================
                OFFLINE MESSAGE
            ================================================= */}

            {!cameraActive && (
              <div
                style={{
                  color:
                    "#9ca3af",

                  textAlign:
                    "center",

                  padding:
                    "40px",
                }}
              >

                <div
                  style={{
                    fontSize:
                      "50px",

                    marginBottom:
                      "15px",
                  }}
                >
                  📷
                </div>

                <h3>
                  Camera Offline
                </h3>

                <p>
                  Click "Start Monitoring"
                  to activate the camera.
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
            title="Total Detections"
            value={
              loading
                ? "..."
                : totalDetections
            }
            description="Current detected workers"
            icon="◉"
          />

          <StatCard
            title="Safety Violations"
            value={
              loading
                ? "..."
                : totalViolations
            }
            description="PPE violations recorded"
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
            title="Database Records"
            value={
              loading
                ? "..."
                : records.length
            }
            description="Violation records available"
            icon="▣"
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
                Current YOLO monitoring state
              </p>

            </div>

          </div>

          <div className="ppe-grid">

            <div className="ppe-card">

              <div className="ppe-card-icon">
                👤
              </div>

              <div>

                <span>
                  Workers
                </span>

                <strong>
                  {monitoringStatus?.workers ??
                    0}
                </strong>

              </div>

            </div>

            <div className="ppe-card">

              <div className="ppe-card-icon">
                ✓
              </div>

              <div>

                <span>
                  Compliant
                </span>

                <strong>
                  {monitoringStatus?.compliant ??
                    0}
                </strong>

              </div>

            </div>

            <div className="ppe-card">

              <div
                className="ppe-card-icon"
                style={{
                  background:
                    "#fee2e2",
                  color:
                    "#dc2626",
                }}
              >
                !
              </div>

              <div>

                <span>
                  Violating
                </span>

                <strong>
                  {monitoringStatus?.violating ??
                    0}
                </strong>

              </div>

            </div>

            <div className="ppe-card">

              <div
                className="ppe-card-icon"
                style={{
                  background:
                    "#fff7ed",
                  color:
                    "#ea580c",
                }}
              >
                ⚠
              </div>

              <div>

                <span>
                  Missing PPE
                </span>

                <strong>
                  {monitoringStatus?.missing_ppe ??
                    0}
                </strong>

              </div>

            </div>

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
                  />

                  <XAxis
                    dataKey="name"
                  />

                  <YAxis
                    allowDecimals={
                      false
                    }
                  />

                  <Tooltip />

                  <Legend />

                  <Bar
                    dataKey="count"
                    name="Detections"
                    fill="#2563eb"
                    radius={[
                      6,
                      6,
                      0,
                      0,
                    ]}
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
                  Detected PPE violations
                </p>

              </div>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <PieChart>

                  <Pie
                    data={
                      violationChartData
                    }
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={
                      110
                    }
                    label
                  >

                    {violationChartData.map(
                      (
                        entry,
                        index
                      ) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            [
                              "#ef4444",
                              "#f97316",
                              "#eab308",
                              "#8b5cf6",
                            ][
                              index %
                                4
                            ]
                          }
                        />
                      )
                    )}

                  </Pie>

                  <Tooltip />

                  <Legend />

                </PieChart>

              </ResponsiveContainer>

            </div>

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
                  key={item.name}
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
            RECORDS
        ==================================================== */}

        <section className="panel">

          <div className="panel-header">

            <div>

              <h3>
                Recent Monitoring Records
              </h3>

              <p>
                Latest PPE violations stored
                in the database
              </p>

            </div>

            <div className="panel-actions">

              <button
                className="refresh-button"
                onClick={
                  fetchDashboardData
                }
              >
                ↻ Refresh
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
                      No monitoring records
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
                            );

                        return (
                          <tr
                            key={
                              id ??
                              index
                            }
                          >

                            <td>
                              {id}
                            </td>

                            <td>
                              {timestamp}
                            </td>

                            <td>
                              {personId}
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

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer>

        Industrial PPE Monitoring System
        • AI-powered workplace safety

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
  danger,
  success,
}) {
  return (
    <div
      className={`stat-card ${
        danger ? "danger" : ""
      } ${
        success ? "success" : ""
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

export default App;