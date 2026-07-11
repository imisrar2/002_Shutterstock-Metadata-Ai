import React, { useEffect, useState } from "react";
import { getSessionState, clearSession } from "@/storage/sessionManager";
import type { SessionState } from "@/types";

export function SessionResumeBanner() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getSessionState().then(setSession);
  }, []);

  if (!session?.hasPendingSession || dismissed) return null;

  return (
    <div className="banner">
      <span>A previous session has unfinished assets. Resume where you left off?</span>
      <div className="banner-actions">
        <button className="btn btn-ghost" onClick={() => setDismissed(true)}>
          Resume
        </button>
        <button
          className="btn btn-danger"
          onClick={async () => {
            await clearSession();
            setDismissed(true);
          }}
        >
          Start New
        </button>
      </div>
    </div>
  );
}
