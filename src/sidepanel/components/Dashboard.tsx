import React, { useEffect, useState } from "react";
import { useQueue } from "../hooks/useQueue";
import { useSettings } from "../hooks/useSettings";
import { StatusBar } from "./StatusBar";
import { QueueList } from "./QueueList";
import { LiveLogs } from "./LiveLogs";
import { SessionResumeBanner } from "./SessionResumeBanner";
import { getAllKeys } from "@/services/apiKeyRotation";
import type { ProcessingStatus } from "@/types";

export function Dashboard() {
  const {
    snapshot,
    progress,
    currentItem,
    logs,
    scanNow,
    start,
    pause,
    resume,
    stop,
    clear,
    retryFailed,
    skipCurrent,
    restartQueue,
  } = useQueue();
  const { settings } = useSettings();
  const [hasKeys, setHasKeys] = useState(true);

  useEffect(() => {
    getAllKeys().then((keys) => setHasKeys(keys.some((k) => !k.disabled)));
  }, [snapshot.status]);

  useEffect(() => {
    // Initial + periodic re-scan so newly uploaded assets are picked up.
    scanNow();
    const interval = setInterval(scanNow, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status: ProcessingStatus = snapshot.status;
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isIdle = status === "idle" || status === "stopped" || status === "completed";
  const canStart = progress.remaining > 0 && !isRunning && hasKeys;

  // Calculate processing time
  const processingTimeMs = snapshot.startedAt
    ? Date.now() - snapshot.startedAt
    : 0;
  const estRemainingMs =
    progress.completed > 0 && snapshot.startedAt
      ? (processingTimeMs / progress.completed) * progress.remaining
      : progress.remaining * 15_000;

  return (
    <>
      <SessionResumeBanner />

      {!hasKeys && (
        <div className="banner" style={{ background: "var(--warn-soft)" }}>
          <span>Add a Gemini API key in Settings to start automation.</span>
        </div>
      )}

      {/* ========== Current Asset Panel ========== */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <p className="card-title" style={{ margin: 0 }}>
            Current Asset
          </p>
          <StatusBar status={status} />
        </div>

        {currentItem ? (
          <div className="current-item">
            <div className={`scan-thumb ${isRunning ? "is-scanning" : ""}`}>
              {(currentItem.thumbnailUrl || currentItem.thumbnailDataUrl) && (
                <img
                  src={currentItem.thumbnailUrl || currentItem.thumbnailDataUrl || ""}
                  alt=""
                />
              )}
            </div>
            <div className="current-item-meta">
              <div className="current-item-name">{currentItem.fileName}</div>
              <div className="current-item-sub">
                {currentItem.currentStep || stateLabel(currentItem.state)}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>
            {progress.total === 0
              ? "No assets detected. Open the Not Submitted page to scan your portfolio."
              : "Ready. Click Start Automation to begin."}
          </p>
        )}

        {/* Progress Bar */}
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: progress.total
                ? `${(progress.completed / progress.total) * 100}%`
                : "0%",
            }}
          />
        </div>

        {/* Stats Grid */}
        <div className="stats-grid" style={{ marginTop: 12 }}>
          <div className="stat-box">
            <div className="stat-value">{progress.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{progress.remaining}</div>
            <div className="stat-label">Remaining</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{progress.failed}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>

        {/* Time Stats */}
        <div className="stats-grid" style={{ marginTop: 6 }}>
          <div className="stat-box">
            <div className="stat-value" style={{ fontSize: 14 }}>
              {processingTimeMs > 0 ? formatDuration(processingTimeMs) : "—"}
            </div>
            <div className="stat-label">Elapsed</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ fontSize: 14 }}>
              {progress.remaining > 0 ? formatDuration(estRemainingMs) : "—"}
            </div>
            <div className="stat-label">Est. Time</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ fontSize: 14 }}>
              {progress.total}
            </div>
            <div className="stat-label">Total</div>
          </div>
        </div>
      </div>

      {/* ========== Controls ========== */}
      <div className="card">
        <p className="card-title">Controls</p>

        {/* Primary action button(s) */}
        {isRunning ? (
          <div className="btn-row">
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pause}>
              ⏸ Pause
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={stop}>
              ⏹ Stop
            </button>
          </div>
        ) : isPaused ? (
          <div className="btn-row">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={resume}>
              ▶ Resume
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={stop}>
              ⏹ Stop
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-full"
            disabled={!canStart}
            onClick={start}
          >
            ▶ Start Automation
          </button>
        )}

        {/* Secondary controls */}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={skipCurrent}
            disabled={!isRunning}
            title="Skip the current asset"
            style={{ gridColumn: "1 / -1" }}
          >
            ⏭ Skip
          </button>
        </div>

        <div className="btn-row" style={{ marginTop: 6 }}>
          <button
            className="btn btn-ghost"
            onClick={retryFailed}
            disabled={progress.failed === 0}
            title="Retry all failed assets"
          >
            🔄 Retry Failed
          </button>
          <button
            className="btn btn-ghost"
            onClick={restartQueue}
            disabled={progress.total === 0}
            title="Reset all assets to waiting"
          >
            ↺ Restart Queue
          </button>
        </div>

        <div className="btn-row" style={{ marginTop: 6 }}>
          <button
            className="btn btn-danger"
            onClick={clear}
            disabled={progress.total === 0}
            style={{ gridColumn: "1 / -1" }}
          >
            🗑 Clear Queue
          </button>
        </div>
      </div>

      {/* ========== Queue ========== */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <p className="card-title" style={{ margin: 0 }}>
            Queue ({progress.total})
          </p>
          <button
            className="small-btn"
            onClick={scanNow}
            title="Re-scan page"
            aria-label="Re-scan page"
          >
            <RefreshIcon />
          </button>
        </div>
        <QueueList items={snapshot.items} currentItemId={snapshot.currentItemId} />
      </div>

      {/* ========== Live Logs ========== */}
      <div className="card">
        <p className="card-title">Live Logs</p>
        <LiveLogs logs={logs} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    waiting: "Waiting",
    opening: "Opening...",
    loading_editor: "Loading editor...",
    analyzing: "Analyzing...",
    generating_metadata: "Generating metadata...",
    writing_metadata: "Writing metadata...",
    validating: "Validating...",
    completed: "Completed",
    retrying: "Retrying...",
    skipped: "Skipped",
    failed: "Failed",
    needs_review: "Needs Review",
  };
  return labels[state] || state;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
