import type { QueueItem, QueueSnapshot, ScannedAsset, LogEntry } from "@/types";

export function createEmptySnapshot(): QueueSnapshot {
  return {
    items: [],
    status: "idle",
    currentItemId: null,
    startedAt: null,
    updatedAt: Date.now(),
    logs: [],
    currentPage: 1,
    totalPages: null,
  };
}

export function assetIdFor(asset: ScannedAsset): string {
  return asset.cardId || `asset_${asset.index}_${asset.name}`;
}

/**
 * Merges freshly-scanned portfolio assets into the existing snapshot:
 * new assets are appended as "waiting", assets that disappeared are
 * dropped, and assets that already have progress keep it.
 */
export function mergeScannedAssets(
  existing: QueueItem[],
  scanned: ScannedAsset[]
): QueueItem[] {
  const existingById = new Map(existing.map((i) => [i.id, i]));
  const scannedIds = new Set(scanned.map(assetIdFor));

  const merged: QueueItem[] = scanned.map((asset) => {
    const id = assetIdFor(asset);
    const prior = existingById.get(id);
    if (prior) {
      return {
        ...prior,
        index: asset.index,
        thumbnailUrl: asset.thumbnailUrl ?? prior.thumbnailUrl,
      };
    }
    return {
      id,
      fileName: asset.name,
      index: asset.index,
      thumbnailUrl: asset.thumbnailUrl,
      thumbnailDataUrl: null,
      state: "waiting" as const,
      currentStep: null,
      attempts: 0,
      metadata: null,
      error: null,
      updatedAt: Date.now(),
    };
  });

  // Preserve items that still have progress but were momentarily
  // missed by the scan (lazy-rendered / scrolled out of viewport).
  for (const item of existing) {
    if (!scannedIds.has(item.id) && item.state !== "waiting") {
      merged.push(item);
    }
  }

  return merged;
}

export function nextWaitingItem(items: QueueItem[]): QueueItem | null {
  return items.find((i) => i.state === "waiting") ?? null;
}

export function queueProgress(items: QueueItem[]) {
  const completed = items.filter(
    (i) => i.state === "completed" || i.state === "skipped"
  ).length;
  const failed = items.filter((i) => i.state === "failed").length;
  const needsReview = items.filter((i) => i.state === "needs_review").length;
  const inProgress = items.filter((i) =>
    ["opening", "loading_editor", "analyzing", "generating_metadata", "writing_metadata", "validating", "retrying"].includes(i.state)
  ).length;
  const remaining = items.filter(
    (i) => i.state === "waiting" || inProgressStates.has(i.state)
  ).length;
  return { completed, failed, needsReview, inProgress, remaining, total: items.length };
}

const inProgressStates = new Set([
  "opening",
  "loading_editor",
  "analyzing",
  "generating_metadata",
  "writing_metadata",
  "validating",
  "retrying",
]);

/**
 * Adds a log entry to the snapshot, keeping a max of 500 entries
 * to prevent memory bloat.
 */
export function appendLog(
  logs: LogEntry[],
  message: string,
  level: LogEntry["level"] = "info"
): LogEntry[] {
  const entry: LogEntry = { timestamp: Date.now(), message, level };
  const updated = [...logs, entry];
  if (updated.length > 500) {
    return updated.slice(-400); // Trim to last 400
  }
  return updated;
}

/** Legacy compatibility — maps old QueueItemDom format to ScannedAsset. */
export function legacyItemToAsset(item: {
  rowIndex: number;
  fileName: string;
  thumbnailDataUrl: string | null;
}): ScannedAsset {
  return {
    index: item.rowIndex,
    name: item.fileName,
    thumbnailUrl: item.thumbnailDataUrl,
    cardId: `card_${item.rowIndex}_${item.fileName}`,
  };
}

// Keep old export name working
export { assetIdFor as itemIdFor };
export { mergeScannedAssets as mergeScannedItems };
export { nextWaitingItem as nextPendingItem };
