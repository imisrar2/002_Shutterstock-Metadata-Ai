/**
 * Automation Engine
 *
 * The core orchestrator that processes each asset through a 10-step
 * workflow: find → open → wait → extract → analyze → fill → validate →
 * mark complete → next asset.
 *
 * Runs in the background service worker and communicates with the content
 * script via chrome.tabs.sendMessage for each step.
 */
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  AUTOMATION_DELAY_BETWEEN_ASSETS_MS,
} from "@/constants/config";
import { SHUTTERSTOCK_CATEGORIES } from "@/constants/categories";
import type {
  AppSettings,
  QueueItem,
  QueueSnapshot,
  RuntimeMessage,
  LogEntry,
} from "@/types";
import { storageGet, storageSet } from "@/storage/storageService";
import { generateMetadataForImage } from "@/services/geminiService";
import {
  createEmptySnapshot,
  nextWaitingItem,
  queueProgress,
  appendLog,
} from "@/queue/queueTypes";
import { createLogger } from "@/utils/logger";
import { sleep } from "@/utils/retry";

const log = createLogger("automationEngine");

/** EMA-smoothed average ms per item, used for ETA estimation. */
let avgItemDurationMs = 15_000;

let isRunning = false;
let stopRequested = false;
let pauseRequested = false;
let skipCurrentRequested = false;

// ---------------------------------------------------------------------------
// Snapshot Helpers
// ---------------------------------------------------------------------------

async function getSnapshot(): Promise<QueueSnapshot> {
  return (
    (await storageGet<QueueSnapshot>(STORAGE_KEYS.QUEUE_SNAPSHOT)) ??
    createEmptySnapshot()
  );
}

async function saveSnapshot(snapshot: QueueSnapshot): Promise<void> {
  snapshot.updatedAt = Date.now();
  await storageSet(STORAGE_KEYS.QUEUE_SNAPSHOT, snapshot);
  broadcast({ type: "QUEUE_UPDATED", snapshot });
}

async function getSettings(): Promise<AppSettings> {
  return (
    (await storageGet<AppSettings>(STORAGE_KEYS.SETTINGS)) ?? DEFAULT_SETTINGS
  );
}

function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel closed — safe to ignore.
  });
}

function broadcastLog(message: string, level: LogEntry["level"] = "info"): void {
  broadcast({
    type: "LOG_ENTRY",
    entry: { timestamp: Date.now(), message, level },
  });
}

async function addLog(
  snapshot: QueueSnapshot,
  message: string,
  level: LogEntry["level"] = "info"
): Promise<QueueSnapshot> {
  snapshot.logs = appendLog(snapshot.logs, message, level);
  broadcastLog(message, level);
  return snapshot;
}

async function updateItem(
  itemId: string,
  patch: Partial<QueueItem>
): Promise<QueueSnapshot> {
  const snapshot = await getSnapshot();
  snapshot.items = snapshot.items.map((i) =>
    i.id === itemId ? { ...i, ...patch, updatedAt: Date.now() } : i
  );
  await saveSnapshot(snapshot);
  return snapshot;
}

async function updateStatus(
  status: QueueSnapshot["status"]
): Promise<void> {
  const snapshot = await getSnapshot();
  snapshot.status = status;
  await saveSnapshot(snapshot);
}

// ---------------------------------------------------------------------------
// Content Script Communication
// ---------------------------------------------------------------------------

async function sendToContentScript<T>(
  message: RuntimeMessage
): Promise<T | null> {
  const tabs = await chrome.tabs.query({
    url: "https://submit.shutterstock.com/*",
  });
  if (tabs.length === 0 || !tabs[0].id) return null;
  try {
    return (await chrome.tabs.sendMessage(tabs[0].id, message)) as T;
  } catch (err) {
    log.warn("Failed to message content script", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 10-Step Automation Workflow
// ---------------------------------------------------------------------------

async function processItem(
  item: QueueItem,
  settings: AppSettings
): Promise<void> {
  const startedAt = Date.now();
  let snap: QueueSnapshot;

  // STEP 1: Mark as opening
  snap = await updateItem(item.id, {
    state: "opening",
    currentStep: "Opening asset",
  });
  snap = await addLog(snap, `Opening asset #${item.index + 1}: ${item.fileName}...`, "step");
  await saveSnapshot(snap);

  // Helper to gracefully abort and reset state
  const checkAbort = async () => {
    if (skipCurrentRequested || stopRequested) {
      const wasSkipped = skipCurrentRequested;
      if (wasSkipped) skipCurrentRequested = false; // Reset so we don't skip the next item too
      
      snap = await updateItem(item.id, {
        state: wasSkipped ? "skipped" : "waiting",
        currentStep: null,
      });
      if (wasSkipped) {
        snap = await addLog(snap, `Skipped asset #${item.index + 1}.`, "warn");
      }
      await saveSnapshot(snap);
      return true;
    }
    return false;
  };

  if (await checkAbort()) return;

  // STEP 2: Click the asset thumbnail
  const openResult = await sendToContentScript<{
    type: string;
    success: boolean;
    error?: string;
  }>({ type: "OPEN_ASSET", index: item.index });

  if (!openResult?.success) {
    snap = await updateItem(item.id, {
      state: "failed",
      currentStep: null,
      error: openResult?.error || "Could not open asset.",
    });
    snap = await addLog(snap, `✗ Failed to open asset: ${openResult?.error || "Unknown error"}`, "error");
    await saveSnapshot(snap);
    return;
  }

  snap = await addLog(await getSnapshot(), "Asset clicked. Waiting for editor...");
  await saveSnapshot(snap);

  // STEP 3: Wait for editor to load
  snap = await updateItem(item.id, {
    state: "loading_editor",
    currentStep: "Loading editor",
  });
  await saveSnapshot(snap);

  const editorResult = await sendToContentScript<{
    type: string;
    success: boolean;
    error?: string;
  }>({ type: "WAIT_EDITOR" });

  if (!editorResult?.success) {
    snap = await updateItem(item.id, {
      state: "failed",
      currentStep: null,
      error: editorResult?.error || "Editor did not load.",
    });
    snap = await addLog(await getSnapshot(), `✗ Editor failed to load: ${editorResult?.error || "Timeout"}`, "error");
    await saveSnapshot(snap);
    return;
  }

  snap = await addLog(await getSnapshot(), "✓ Editor loaded.", "step");
  await saveSnapshot(snap);

  if (await checkAbort()) return;

  // STEP 4: Extract preview image
  snap = await updateItem(item.id, {
    state: "analyzing",
    currentStep: "Extracting preview",
  });
  snap = await addLog(snap, "Extracting preview image...");
  await saveSnapshot(snap);

  const previewResult = await sendToContentScript<{
    type: string;
    imageBase64: string | null;
    mimeType: string;
    error?: string;
  }>({ type: "EXTRACT_PREVIEW", index: item.index, fallbackUrl: item.thumbnailUrl });

  if (!previewResult?.imageBase64) {
    snap = await updateItem(item.id, {
      state: "failed",
      currentStep: null,
      error: previewResult?.error || "Could not extract preview image.",
    });
    snap = await addLog(await getSnapshot(), `✗ Preview extraction failed: ${previewResult?.error || "No image data"}`, "error");
    await saveSnapshot(snap);
    return;
  }

  snap = await addLog(await getSnapshot(), "✓ Preview extracted.");
  await saveSnapshot(snap);

  if (await checkAbort()) return;

  // STEP 5 & 6: Generate metadata via Gemini
  snap = await updateItem(item.id, {
    state: "generating_metadata",
    currentStep: "Generating metadata with AI",
    thumbnailDataUrl: `data:${previewResult.mimeType};base64,${previewResult.imageBase64.slice(0, 100)}...`,
  });
  snap = await addLog(snap, "Generating metadata with Gemini AI...", "step");
  await saveSnapshot(snap);

  let attempts = item.attempts;
  let lastError = "";

  while (attempts < settings.processing.maxRetries) {
    attempts += 1;

    if (await checkAbort()) return;

    const response = await generateMetadataForImage(
      {
        imageBase64: previewResult.imageBase64,
        mimeType: previewResult.mimeType,
        fileName: item.fileName,
        categoryList: SHUTTERSTOCK_CATEGORIES,
        minKeywords: settings.processing.minKeywords,
        maxKeywords: settings.processing.maxKeywords,
      },
      settings.processing.requestTimeoutMs
    );

    if (response.ok) {
      snap = await addLog(await getSnapshot(), "✓ Metadata generated successfully.", "step");
      await saveSnapshot(snap);

      if (await checkAbort()) return;

      // STEP 7: Write metadata into form
      snap = await updateItem(item.id, {
        state: "writing_metadata",
        currentStep: "Writing metadata to form",
        attempts,
        metadata: response.metadata,
      });
      snap = await addLog(snap, "Writing title...");
      await saveSnapshot(snap);

      const fillResult = await sendToContentScript<{
        type: string;
        success: boolean;
        verified?: boolean;
        error?: string;
        details?: Record<string, boolean>;
        diagnostics?: string[];
      }>({ type: "FILL_METADATA", metadata: response.metadata });

      // Log diagnostics (scope resolution, field outcomes) to the sidepanel
      if (fillResult?.diagnostics?.length) {
        for (const line of fillResult.diagnostics) {
          const level = line.includes("✗") || line.includes("not found") || line.includes("failed") ? "warn" : "info";
          snap = await addLog(await getSnapshot(), `  ${line}`, level);
        }
        await saveSnapshot(snap);
      } else if (fillResult?.details) {
        // Fallback: log only required field failures
        const requiredFields = ["title", "description", "keywords"];
        for (const [field, ok] of Object.entries(fillResult.details)) {
          if (requiredFields.includes(field) && !ok) {
            snap = await addLog(await getSnapshot(), `  ✗ ${field} failed`, "warn");
          }
        }
        await saveSnapshot(snap);
      }

      if (!fillResult?.success) {
        lastError = fillResult?.error || "Could not fill form fields.";
        snap = await addLog(await getSnapshot(), `Autofill issue: ${lastError}`, "warn");
        snap = await updateItem(item.id, { state: "retrying", currentStep: "Retrying", attempts });
        await saveSnapshot(snap);
        continue;
      }

      // STRICT VERIFICATION CHECK
      if (fillResult?.verified === false) {
        lastError = fillResult?.error || "Save verification failed. Processing paused.";
        snap = await addLog(await getSnapshot(), `✗ ${lastError}`, "error");
        snap = await updateItem(item.id, { state: "failed", currentStep: null, attempts, error: lastError });
        await saveSnapshot(snap);
        
        // Critical failure: Stop automation entirely
        pauseRequested = true;
        return; // Abort processing this item immediately
      }

      if (await checkAbort()) return;

      // STEP 8: Validate
      snap = await updateItem(item.id, {
        state: "validating",
        currentStep: "Validating filled metadata",
      });
      snap = await addLog(snap, "Validating...");
      await saveSnapshot(snap);

      const validationResult = await sendToContentScript<{
        type: string;
        valid: boolean;
        missingFields: string[];
      }>({ type: "VALIDATE_METADATA" });

      if (!validationResult?.valid) {
        const missing = validationResult?.missingFields?.join(", ") || "unknown";
        lastError = `Validation failed — missing: ${missing}`;
        snap = await addLog(await getSnapshot(), `⚠ ${lastError} (ignoring and proceeding to next)`, "warn");
        // User requested to ignore validation failures and move to next without retrying
      }

      // STEP 9: Mark completed!
      avgItemDurationMs = ema(avgItemDurationMs, Date.now() - startedAt);
      snap = await updateItem(item.id, {
        state: "completed",
        currentStep: null,
        attempts,
        metadata: response.metadata,
        error: null,
      });
      snap = await addLog(snap, `✓ Asset #${item.index + 1} completed!`, "step");
      await saveSnapshot(snap);
      return;
    }

    // AI response not OK
    lastError = response.message;
    snap = await addLog(await getSnapshot(), `AI error: ${response.message}`, "warn");

    if (!response.retryable) break;

    snap = await updateItem(item.id, {
      state: "retrying",
      currentStep: `Retrying (attempt ${attempts})`,
      attempts,
    });
    await saveSnapshot(snap);
  }

  // All retries exhausted
  snap = await updateItem(item.id, {
    state: "failed",
    currentStep: null,
    attempts,
    error: lastError || "Processing failed after maximum retries.",
  });
  snap = await addLog(snap, `✗ Asset failed: ${lastError}`, "error");
  await saveSnapshot(snap);
}

// ---------------------------------------------------------------------------
// Main Automation Loop
// ---------------------------------------------------------------------------

async function runLoop(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  stopRequested = false;

  try {
    let snap = await getSnapshot();
    snap.status = "running";
    snap.startedAt = snap.startedAt || Date.now();
    snap = await addLog(snap, "Automation started.", "step");
    await saveSnapshot(snap);

    // Track whether we've already done an auto-retry pass.
    // After the first pass, failed items are retried once automatically.
    let autoRetryDone = false;

    while (true) {
      if (stopRequested) {
        await updateStatus("stopped");
        const s = await getSnapshot();
        await addLog(s, "Automation stopped by user.", "step");
        await saveSnapshot(s);
        break;
      }
      if (pauseRequested) {
        await updateStatus("paused");
        const s = await getSnapshot();
        await addLog(s, "Automation paused.", "step");
        await saveSnapshot(s);
        break;
      }

      const snapshot = await getSnapshot();
      const next = nextWaitingItem(snapshot.items);

      if (!next) {
        // No more waiting items on this page — try auto-pagination
        const paginationWorked = await tryAutoPaginate();
        if (paginationWorked) {
          continue; // Re-check after pagination
        }

        // Check for failed items and auto-retry them once
        if (!autoRetryDone) {
          const failedItems = snapshot.items.filter(
            (i) => i.state === "failed"
          );
          if (failedItems.length > 0) {
            autoRetryDone = true;
            const retrySnap = await getSnapshot();
            retrySnap.items = retrySnap.items.map((item) =>
              item.state === "failed"
                ? {
                    ...item,
                    state: "waiting" as const,
                    error: null,
                    currentStep: null,
                    attempts: 0,
                  }
                : item
            );
            await addLog(
              retrySnap,
              `🔄 Auto-retrying ${failedItems.length} failed asset(s) from the start...`,
              "step"
            );
            await saveSnapshot(retrySnap);
            continue; // Re-enter the loop to process the reset items
          }
        }

        // Truly done
        await updateStatus("completed");
        const s = await getSnapshot();
        await addLog(s, "All assets have been processed!", "step");
        await saveSnapshot(s);
        await maybeNotifyCompletion();
        break;
      }

      // Handle skip
      if (skipCurrentRequested) {
        skipCurrentRequested = false;
        await updateItem(next.id, {
          state: "skipped",
          currentStep: null,
        });
        const s = await getSnapshot();
        await addLog(s, `Skipped asset #${next.index + 1}.`, "warn");
        await saveSnapshot(s);
        continue;
      }

      const withCurrent = await getSnapshot();
      withCurrent.currentItemId = next.id;
      await saveSnapshot(withCurrent);

      const settings = await getSettings();
      await processItem(next, settings);

      // Brief pause between assets to avoid hammering
      await sleep(AUTOMATION_DELAY_BETWEEN_ASSETS_MS);
    }
  } finally {
    isRunning = false;
  }
}

/**
 * When all items on the current page are done, try to navigate to the
 * next pagination page, wait for it to load, and scan new assets.
 */
async function tryAutoPaginate(): Promise<boolean> {
  const snap = await getSnapshot();
  await addLog(snap, "Checking for next page...");
  await saveSnapshot(snap);

  const result = await sendToContentScript<{
    type: string;
    success: boolean;
    error?: string;
  }>({ type: "NEXT_PAGE" });

  if (!result?.success) {
    return false;
  }

  // Wait for the new page to load
  await sleep(3000);

  // Re-scan the portfolio
  const scanResult = await sendToContentScript<{
    type: string;
    assets: Array<{
      index: number;
      name: string;
      thumbnailUrl: string | null;
      cardId: string;
    }>;
  }>({ type: "SCAN_PORTFOLIO" });

  if (scanResult?.assets && scanResult.assets.length > 0) {
    const snapshot = await getSnapshot();
    const { mergeScannedAssets } = await import("@/queue/queueTypes");
    snapshot.items = mergeScannedAssets(snapshot.items, scanResult.assets);
    snapshot.currentPage = (snapshot.currentPage || 1) + 1;
    await addLog(snapshot, `Page ${snapshot.currentPage}: ${scanResult.assets.length} new assets found.`, "step");
    await saveSnapshot(snapshot);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// EMA Helper
// ---------------------------------------------------------------------------

function ema(prev: number, sample: number, alpha = 0.3): number {
  return Math.round(prev * (1 - alpha) + sample * alpha);
}

export function estimatedRemainingMs(remainingItems: number): number {
  return remainingItems * avgItemDurationMs;
}

// ---------------------------------------------------------------------------
// Completion Notification
// ---------------------------------------------------------------------------

async function maybeNotifyCompletion(): Promise<void> {
  const settings = await getSettings();
  if (!settings.general.notifyOnComplete) return;
  const snapshot = await getSnapshot();
  const progress = queueProgress(snapshot.items);
  chrome.notifications.create({
    type: "basic",
    iconUrl: "/public/icons/icon128.png",
    title: "Automation Complete",
    message: `${progress.completed} of ${progress.total} assets processed successfully.`,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startProcessing(): Promise<void> {
  pauseRequested = false;
  stopRequested = false;
  skipCurrentRequested = false;
  void runLoop();
}

export async function pauseProcessing(): Promise<void> {
  pauseRequested = true;
}

export async function resumeProcessing(): Promise<void> {
  pauseRequested = false;
  stopRequested = false;
  void runLoop();
}

export async function stopProcessing(): Promise<void> {
  stopRequested = true;
  pauseRequested = false;
}

export async function skipCurrent(): Promise<void> {
  skipCurrentRequested = true;
}

export async function retryFailed(): Promise<void> {
  const snapshot = await getSnapshot();
  snapshot.items = snapshot.items.map((item) =>
    item.state === "failed"
      ? { ...item, state: "waiting" as const, error: null, currentStep: null, attempts: 0 }
      : item
  );
  await addLog(snapshot, "Retrying all failed assets...", "step");
  await saveSnapshot(snapshot);
}

export async function restartQueue(): Promise<void> {
  stopRequested = true;
  await sleep(500);
  const snapshot = await getSnapshot();
  snapshot.items = snapshot.items.map((item) => ({
    ...item,
    state: "waiting" as const,
    error: null,
    currentStep: null,
    attempts: 0,
    metadata: null,
  }));
  snapshot.status = "idle";
  snapshot.currentItemId = null;
  snapshot.startedAt = null;
  snapshot.logs = appendLog([], "Queue restarted.", "step");
  await saveSnapshot(snapshot);
}

export async function clearQueue(): Promise<void> {
  stopRequested = true;
  await saveSnapshot(createEmptySnapshot());
}
