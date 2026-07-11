import { STORAGE_KEYS } from "@/constants/config";
import type { QueueSnapshot, SessionState } from "@/types";
import { storageGet, storageRemove, storageSet } from "./storageService";

/**
 * Tracks whether there is a resumable session (a queue snapshot left over
 * from before Chrome restarted or the panel was closed) and exposes clean
 * "resume" / "start new" operations. Progress is never silently discarded —
 * only an explicit "Start New Session" or "Clear Queue" clears it.
 */
export async function getSessionState(): Promise<SessionState> {
  const snapshot = await storageGet<QueueSnapshot>(STORAGE_KEYS.QUEUE_SNAPSHOT);
  const hasItems = !!snapshot && snapshot.items.length > 0;
  const isFinished =
    !!snapshot && snapshot.items.every((i) => i.state === "filled" || i.state === "skipped");

  return {
    hasPendingSession: hasItems && !isFinished,
    queueSnapshotExists: hasItems,
    lastUpdatedAt: snapshot?.updatedAt ?? null
  };
}

export async function clearSession(): Promise<void> {
  await storageRemove(STORAGE_KEYS.QUEUE_SNAPSHOT);
  await storageRemove(STORAGE_KEYS.SESSION_FLAG);
}

export async function markSessionActive(): Promise<void> {
  await storageSet(STORAGE_KEYS.SESSION_FLAG, true);
}
