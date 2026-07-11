import React from "react";
import type { QueueItem } from "@/types";

const STATE_LABEL: Record<QueueItem["state"], string> = {
  waiting: "Waiting",
  opening: "Opening",
  loading_editor: "Loading",
  analyzing: "Analyzing",
  generating_metadata: "AI",
  writing_metadata: "Writing",
  validating: "Validating",
  completed: "Completed",
  retrying: "Retrying",
  skipped: "Skipped",
  failed: "Failed",
  needs_review: "Review",
};

interface Props {
  items: QueueItem[];
  currentItemId?: string | null;
}

export function QueueList({ items, currentItemId }: Props) {
  if (items.length === 0) {
    return (
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: 12,
          textAlign: "center",
          padding: "12px 0",
        }}
      >
        No assets detected yet. Open the Not Submitted portfolio page.
      </p>
    );
  }

  return (
    <div className="queue-list">
      {items.map((item) => (
        <div
          className={`queue-row ${item.id === currentItemId ? "queue-row-active" : ""}`}
          key={item.id}
          title={item.error ?? item.currentStep ?? undefined}
        >
          {item.thumbnailUrl || item.thumbnailDataUrl ? (
            <img
              className="queue-row-thumb"
              src={item.thumbnailUrl || item.thumbnailDataUrl || ""}
              alt=""
            />
          ) : (
            <div className="queue-row-thumb" />
          )}
          <span className="queue-row-name">{item.fileName}</span>
          <span className={`queue-row-state state-${item.state}`}>
            {STATE_LABEL[item.state]}
          </span>
        </div>
      ))}
    </div>
  );
}
