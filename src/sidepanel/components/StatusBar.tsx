import React from "react";
import type { ProcessingStatus } from "@/types";

const LABELS: Record<ProcessingStatus, string> = {
  idle: "Idle",
  scanning: "Scanning",
  running: "Running",
  paused: "Paused",
  waiting: "Waiting",
  retrying: "Retrying",
  completed: "Completed",
  stopped: "Stopped",
  failed: "Failed",
};

export function StatusBar({ status }: { status: ProcessingStatus }) {
  return <span className={`status-pill status-${status}`}>{LABELS[status]}</span>;
}
