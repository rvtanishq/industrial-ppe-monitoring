import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Download,
  HardHat,
  ShieldAlert,
  Users,
  Wifi,
  WifiOff,
  Play,
  Square,
} from "lucide-react";

import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [status, setStatus] = useState({
    monitoring: false,
    alarm: false,
    workers: 0,
    compliant: 0,
    violating: 0,
    missing_ppe: 0,
    last_update: null,
  });

  const [history, setHistory] = useState({
    total_violations: 0,
    workers_involved: 0,
  });

  const [violations, setViolations] = useState([]);

  const [cameraFrame, setCameraFrame] = useState(null);

  const [backendOnline, setBackendOnline] = useState(false);

  const [loading, setLoading] = useState(false);

  const websocketRef = useRef(null);

  // ============================================================
  // LOAD DASHBOARD
  // ============================================================

  const loadDashboard = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/dashboard`
      );

      setBackendOnline(true);

      setStatus(response.data.live);

      setHistory(response.data.history);
    } catch (error) {
      setBackendOnline(false);
    }
  };

  // ============================================================
  // LOAD VIOLATION HISTORY
  // ============================================================

  const loadViolations = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/violations`
      );

      setViolations(
        response.data.violations || []
      );
    } catch (error) {
      console.error(
        "Could not load violations:",
        error
      );
    }
  };

  // ============================================================
  // WEBSOCKET
  // ============================================================

  const connectWebSocket = () => {
    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      return;
    }

    const socket = new WebSocket(
      "ws://127.0.0.1:8000/ws/camera"
    );

    websocketRef.current = socket;

    socket.onopen = () => {
      console.log(
        "Camera WebSocket connected."
      );
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(
          event.data
        );

        if (data.status) {
          setStatus(data.status);
        }

        if (data.image) {
          setCameraFrame(
            `data:image/jpeg;base64,${data.image}`
          );
        }
      } catch (error) {
        console.error(
          "WebSocket data error:",
          error
        );
      }
    };

    socket.onerror = (error) => {
      console.error(
        "WebSocket error:",
        error
      );
    };

    socket.onclose = () => {
      console.log(
        "Camera WebSocket disconnected."
      );

      websocketRef.current = null;

      setTimeout(() => {
        connectWebSocket();
      }, 2000);
    };
  };

  // ============================================================
  // START MONITORING
  // ============================================================

  const startMonitoring = async () => {
    setLoading(true);

    try {
      await axios.post(
        `${API_URL}/api/monitoring/start`
      );

      await loadDashboard();

      connectWebSocket();
    } catch (error) {
      alert(
        "Could not start monitoring. Make sure FastAPI is running."
      );
    }

    setLoading(false);
  };

  // ============================================================
  // STOP MONITORING
  // ============================================================

  const stopMonitoring = async () => {
    setLoading(true);

    try {
      await axios.post(
        `${API_URL}/api/monitoring/stop`
      );

      await loadDashboard();

      setCameraFrame(null);
    } catch (error) {
      alert(
        "Could not stop monitoring."
      );
    }

    setLoading(false);
  };

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    loadDashboard();
    loadViolations();

    const interval = setInterval(() => {
      loadDashboard();
      loadViolations();
    }, 2000);

    return () => {
      clearInterval(interval);

      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  // ============================================================
  // DOWNLOAD EXCEL
  // ============================================================

  const downloadExcel = () => {
    window.open(
      `${API_URL}/api/violations/export`,
      "_blank"
    );
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="app">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <header className="header">

        <div className="brand">

          <div className="brand-icon">
            <HardHat size={30} />
          </div>

          <div>
            <h1>
              PPE Guard
            </h1>

            <p>
              Industrial Safety Monitoring
            </p>
          </div>

        </div>

        <div
          className={
            backendOnline
              ? "connection online"
              : "connection offline"
          }
        >

          {backendOnline ? (
            <>
              <Wifi size={17} />
              SYSTEM ONLINE
            </>
          ) : (
            <>
              <WifiOff size={17} />
              BACKEND OFFLINE
            </>
          )}

        </div>

      </header>


      {/* ====================================================== */}
      {/* MAIN */}
      {/* ====================================================== */}

      <main className="dashboard">

        {/* ==================================================== */}
        {/* LIVE MONITORING */}
        {/* ==================================================== */}

        <section className="monitor-section">

          <div className="section-title">

            <div>
              <h2>
                Live Monitoring
              </h2>

              <p>
                Real-time AI PPE detection
              </p>
            </div>

            <div
              className={
                status.monitoring
                  ? "live-indicator active"
                  : "live-indicator"
              }
            >
              <span></span>

              {status.monitoring
                ? "LIVE"
                : "STOPPED"}
            </div>

          </div>


          <div className="monitor-grid">

            {/* CAMERA */}

            <div className="camera-card">

              {cameraFrame ? (

                <img
                  src={cameraFrame}
                  alt="Live PPE monitoring"
                  className="camera-feed"
                />

              ) : (

                <div className="camera-placeholder">

                  <Activity
                    size={60}
                  />

                  <h3>
                    Camera Offline
                  </h3>

                  <p>
                    Start monitoring to begin
                    live PPE detection.
                  </p>

                </div>

              )}

            </div>


            {/* LIVE STATUS */}

            <div className="status-card">

              <div className="status-header">

                <h3>
                  Live Status
                </h3>

                <Activity
                  size={22}
                />

              </div>


              <div className="status-list">

                <div className="status-row">

                  <div className="status-label">
                    <Users size={20} />
                    Workers
                  </div>

                  <strong>
                    {status.workers}
                  </strong>

                </div>


                <div className="status-row">

                  <div className="status-label">
                    <CheckCircle size={20} />
                    Compliant
                  </div>

                  <strong className="green">
                    {status.compliant}
                  </strong>

                </div>


                <div className="status-row">

                  <div className="status-label">
                    <ShieldAlert size={20} />
                    Violating
                  </div>

                  <strong className="red">
                    {status.violating}
                  </strong>

                </div>


                <div className="status-row">

                  <div className="status-label">
                    <AlertTriangle size={20} />
                    Missing PPE
                  </div>

                  <strong className="orange">
                    {status.missing_ppe}
                  </strong>

                </div>

              </div>


              {/* ALARM */}

              <div
                className={
                  status.alarm
                    ? "alarm-box active"
                    : "alarm-box"
                }
              >

                {status.alarm ? (
                  <>
                    <AlertTriangle
                      size={24}
                    />

                    <div>
                      <strong>
                        PPE ALARM ACTIVE
                      </strong>

                      <span>
                        Violation detected
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle
                      size={24}
                    />

                    <div>
                      <strong>
                        ALARM OFF
                      </strong>

                      <span>
                        No active violation
                      </span>
                    </div>
                  </>
                )}

              </div>


              {/* BUTTONS */}

              <div className="controls">

                {!status.monitoring ? (

                  <button
                    className="start-button"
                    onClick={startMonitoring}
                    disabled={loading}
                  >

                    <Play size={18} />

                    {loading
                      ? "Starting..."
                      : "Start Monitoring"}

                  </button>

                ) : (

                  <button
                    className="stop-button"
                    onClick={stopMonitoring}
                    disabled={loading}
                  >

                    <Square size={18} />

                    {loading
                      ? "Stopping..."
                      : "Stop Monitoring"}

                  </button>

                )}

              </div>

            </div>

          </div>

        </section>


        {/* ==================================================== */}
        {/* METRICS */}
        {/* ==================================================== */}

        <section className="metrics">

          <MetricCard
            title="Total Violations"
            value={history.total_violations}
            icon={<ShieldAlert />}
            type="red"
          />

          <MetricCard
            title="Workers Involved"
            value={history.workers_involved}
            icon={<Users />}
            type="blue"
          />

          <MetricCard
            title="Current Violations"
            value={status.violating}
            icon={<AlertTriangle />}
            type="orange"
          />

          <MetricCard
            title="Compliant Workers"
            value={status.compliant}
            icon={<CheckCircle />}
            type="green"
          />

        </section>


        {/* ==================================================== */}
        {/* VIOLATION HISTORY */}
        {/* ==================================================== */}

        <section className="history-section">

          <div className="history-header">

            <div>

              <h2>
                Violation History
              </h2>

              <p>
                Recently recorded PPE violations
              </p>

            </div>


            <button
              className="download-button"
              onClick={downloadExcel}
            >

              <Download size={18} />

              Download Excel

            </button>

          </div>


          <div className="table-container">

            <table>

              <thead>

                <tr>

                  <th>
                    Timestamp
                  </th>

                  <th>
                    Worker
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

                {violations.length === 0 ? (

                  <tr>

                    <td
                      colSpan="4"
                      className="empty"
                    >

                      No violations recorded.

                    </td>

                  </tr>

                ) : (

                  violations
                    .slice()
                    .reverse()
                    .slice(0, 20)
                    .map(
                      (item, index) => (

                        <tr
                          key={index}
                        >

                          <td>
                            {item.Timestamp}
                          </td>

                          <td>
                            {item["Person ID"]}
                          </td>

                          <td>
                            <span className="ppe-tag">
                              {item["Missing PPE"]}
                            </span>
                          </td>

                          <td>

                            <span className="violation-tag">

                              <span></span>

                              VIOLATION

                            </span>

                          </td>

                        </tr>

                      )
                    )

                )}

              </tbody>

            </table>

          </div>

        </section>

      </main>


      {/* ====================================================== */}
      {/* FOOTER */}
      {/* ====================================================== */}

      <footer>

        <span>
          PPE Guard
        </span>

        <span>
          AI-powered Industrial Safety System
        </span>

      </footer>

    </div>
  );
}


// ============================================================
// METRIC CARD
// ============================================================

function MetricCard({
  title,
  value,
  icon,
  type,
}) {

  return (

    <div className="metric-card">

      <div
        className={`metric-icon ${type}`}
      >
        {icon}
      </div>

      <div>

        <p>
          {title}
        </p>

        <h3>
          {value}
        </h3>

      </div>

    </div>

  );
}


export default App;