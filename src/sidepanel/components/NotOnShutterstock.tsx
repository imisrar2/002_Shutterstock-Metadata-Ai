import React from "react";

interface Props {
  onGoToShutterstock: () => void;
}

export function NotOnShutterstock({ onGoToShutterstock }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M8 12h8M8 16h5M8 8h3" />
        </svg>
      </div>
      <h2>Not on the Portfolio Page</h2>
      <p>
        Open the Shutterstock Contributor "Not Submitted" page to scan your
        assets and start automation.
      </p>
      <button className="btn btn-primary" onClick={onGoToShutterstock}>
        Go to Not Submitted Portfolio
      </button>
    </div>
  );
}
