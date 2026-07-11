import React, { useEffect, useRef } from "react";
import type { LogEntry } from "@/types";

interface Props {
  logs: LogEntry[];
}

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  info: "log-info",
  warn: "log-warn",
  error: "log-error",
  step: "log-step",
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LiveLogs({ logs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  const handleCopy = () => {
    const text = logs
      .map((l) => `[${formatTime(l.timestamp)}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (logs.length === 0) {
    return (
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: 12,
          textAlign: "center",
          padding: "12px 0",
        }}
      >
        No logs yet. Start automation to see live activity.
      </p>
    );
  }

  return (
    <div>
      <div className="live-logs" ref={containerRef}>
        {logs.map((entry, i) => (
          <div
            className={`log-entry ${LEVEL_CLASS[entry.level]}`}
            key={`${entry.timestamp}_${i}`}
          >
            <span className="log-time">{formatTime(entry.timestamp)}</span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
      <button
        className="btn btn-ghost btn-full"
        style={{ marginTop: 6, fontSize: 11, padding: "6px 8px" }}
        onClick={handleCopy}
        title="Copy all logs to clipboard"
      >
        Copy Logs
      </button>
    </div>
  );
}
