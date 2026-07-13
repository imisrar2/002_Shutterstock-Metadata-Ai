import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/constants/config";
import type { LogEntry, QueueSnapshot, RuntimeMessage, ScannedAsset, ProcessingStatus } from "@/types";
import { useChromeStorage } from "./useChromeStorage";
import { createEmptySnapshot, mergeScannedAssets, queueProgress } from "@/queue/queueTypes";
import { storageGet, storageSet } from "@/storage/storageService";

export function useQueue() {
  const [snapshot, setSnapshot] = useChromeStorage<QueueSnapshot>(
    STORAGE_KEYS.QUEUE_SNAPSHOT,
    createEmptySnapshot()
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Optimistic status override — allows instant UI feedback before the
  // background script roundtrip completes and broadcasts QUEUE_UPDATED.
  const [optimisticStatus, setOptimisticStatus] = useState<ProcessingStatus | null>(null);

  useEffect(() => {
    // Seed logs from snapshot
    if (snapshot.logs?.length) {
      setLogs(snapshot.logs);
    }
  }, [snapshot.logs]);

  const mergeAndSave = useCallback(
    async (scanned: ScannedAsset[]) => {
      // Always read the LATEST snapshot from storage to avoid overwriting
      // status/currentItemId that the background script may have updated.
      const current =
        (await storageGet<QueueSnapshot>(STORAGE_KEYS.QUEUE_SNAPSHOT)) ??
        createEmptySnapshot();
      const merged = mergeScannedAssets(current.items, scanned);
      const next: QueueSnapshot = { ...current, items: merged, updatedAt: Date.now() };
      await storageSet(STORAGE_KEYS.QUEUE_SNAPSHOT, next);
      setSnapshot(next);
    },
    [setSnapshot]
  );

  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.type === "PORTFOLIO_SCANNED") {
        mergeAndSave(message.assets);
      }
      if (message.type === "PORTFOLIO_CHANGED") {
        mergeAndSave(message.assets);
      }
      if (message.type === "QUEUE_UPDATED") {
        setSnapshot(message.snapshot);
        // Real status has arrived — clear the optimistic override
        setOptimisticStatus(null);
      }
      if (message.type === "LOG_ENTRY") {
        setLogs((prev) => {
          const updated = [...prev, message.entry];
          return updated.length > 500 ? updated.slice(-400) : updated;
        });
      }
      // Legacy
      if (message.type === "QUEUE_SCANNED") {
        const legacyAssets: ScannedAsset[] = message.items.map((item) => ({
          index: item.rowIndex,
          name: item.fileName,
          thumbnailUrl: item.thumbnailDataUrl,
          cardId: `card_${item.rowIndex}_${item.fileName}`,
        }));
        mergeAndSave(legacyAssets);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergeAndSave, setSnapshot]);

  const scanNow = useCallback(async () => {
    const [tab] = await chrome.tabs.query({
      url: "https://submit.shutterstock.com/*",
    });
    if (!tab?.id) return;
    const response = (await chrome.tabs
      .sendMessage(tab.id, { type: "SCAN_PORTFOLIO" } satisfies RuntimeMessage)
      .catch(() => null)) as { assets: ScannedAsset[] } | null;
    if (response?.assets) {
      await mergeAndSave(response.assets);
    }
  }, [mergeAndSave]);

  const start = useCallback(async () => {
    setOptimisticStatus("running");
    await chrome.runtime.sendMessage({ type: "START_PROCESSING" });
  }, []);

  const pause = useCallback(async () => {
    setOptimisticStatus("paused");
    await chrome.runtime.sendMessage({ type: "PAUSE_PROCESSING" });
  }, []);

  const resume = useCallback(async () => {
    setOptimisticStatus("running");
    await chrome.runtime.sendMessage({ type: "RESUME_PROCESSING" });
  }, []);

  const stop = useCallback(async () => {
    setOptimisticStatus("stopped");
    await chrome.runtime.sendMessage({ type: "STOP_PROCESSING" });
  }, []);

  const clear = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_QUEUE" });
    setOptimisticStatus(null);
    setLogs([]);
  }, []);

  const retryFailedItems = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "RETRY_FAILED" });
  }, []);

  const skipCurrentItem = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "SKIP_CURRENT" });
  }, []);

  const restartEntireQueue = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "RESTART_QUEUE" });
    setOptimisticStatus(null);
    setLogs([]);
  }, []);

  const progress = queueProgress(snapshot.items);
  const currentItem =
    snapshot.items.find((i) => i.id === snapshot.currentItemId) ?? null;

  // Use optimistic status if set, otherwise fall back to snapshot's real status
  const effectiveStatus: ProcessingStatus = optimisticStatus ?? snapshot.status;

  // Build a snapshot-like object with the effective status for the Dashboard
  const effectiveSnapshot = useMemo(
    () => ({ ...snapshot, status: effectiveStatus }),
    [snapshot, effectiveStatus]
  );

  return {
    snapshot: effectiveSnapshot,
    progress,
    currentItem,
    logs,
    scanNow,
    start,
    pause,
    resume,
    stop,
    clear,
    retryFailed: retryFailedItems,
    skipCurrent: skipCurrentItem,
    restartQueue: restartEntireQueue,
  };
}
