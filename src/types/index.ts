/**
 * Central type definitions shared across background, content, and side panel.
 * Kept dependency-free so it can be imported anywhere without bundling cost.
 */

// ---------------------------------------------------------------------------
// Queue & Processing States
// ---------------------------------------------------------------------------

export type ProcessingStatus =
  | "idle"
  | "scanning"
  | "running"
  | "paused"
  | "waiting"
  | "retrying"
  | "completed"
  | "stopped"
  | "failed";

export type FillMode = "auto" | "review";

export type QueueItemState =
  | "waiting"
  | "opening"
  | "loading_editor"
  | "analyzing"
  | "generating_metadata"
  | "writing_metadata"
  | "validating"
  | "completed"
  | "retrying"
  | "skipped"
  | "failed"
  | "needs_review";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryOption {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Generated Metadata
// ---------------------------------------------------------------------------

export interface GeneratedMetadata {
  title: string;
  description: string;
  keywords: string[];
  primaryCategory: string;
  secondaryCategory: string | null;
  /** Internal-only confidence, never rendered in the UI. */
  primaryConfidence: number;
  secondaryConfidence: number;
}

// ---------------------------------------------------------------------------
// Queue Items
// ---------------------------------------------------------------------------

/** Lightweight DOM representation returned by the portfolio scanner. */
export interface ScannedAsset {
  /** Index position in the grid (0-based). */
  index: number;
  /** Display name derived from alt text, aria-label, or filename. */
  name: string;
  /** Thumbnail image URL (not base64 — conversion happens later). */
  thumbnailUrl: string | null;
  /** A unique identifier for re-locating this card in the DOM. */
  cardId: string;
}

/** Legacy alias — kept for compatibility during transition. */
export type QueueItemDom = ScannedAsset & {
  rowIndex: number;
  fileName: string;
  thumbnailDataUrl: string | null;
};

export interface QueueItem {
  id: string;
  fileName: string;
  /** Grid index for re-locating the card. */
  index: number;
  thumbnailUrl: string | null;
  thumbnailDataUrl: string | null;
  state: QueueItemState;
  /** Which automation step is currently executing. */
  currentStep: string | null;
  attempts: number;
  metadata: GeneratedMetadata | null;
  error: string | null;
  updatedAt: number;
}

export interface QueueSnapshot {
  items: QueueItem[];
  status: ProcessingStatus;
  currentItemId: string | null;
  startedAt: number | null;
  updatedAt: number;
  logs: LogEntry[];
  /** Current pagination page (1-based). */
  currentPage: number;
  totalPages: number | null;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error" | "step";

export interface LogEntry {
  timestamp: number;
  message: string;
  level: LogLevel;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export interface ApiKeyRecord {
  id: string;
  key: string;
  label: string;
  addedAt: number;
  lastUsedAt: number | null;
  cooldownUntil: number | null;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  disabled: boolean;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type ZoomLevel = 100 | 90 | 80 | 70 | 60;

export interface WorkspaceSettings {
  zoomLevel: ZoomLevel;
  autoOpenSidePanel: boolean;
}

export interface ProcessingSettings {
  fillMode: FillMode;
  maxRetries: number;
  minKeywords: number;
  maxKeywords: number;
  requestTimeoutMs: number;
}

export interface ExportSettings {
  includeFailedItems: boolean;
  filenamePrefix: string;
}

export interface GeneralSettings {
  theme: "dark" | "light" | "system";
  notifyOnComplete: boolean;
}

export interface AppSettings {
  workspace: WorkspaceSettings;
  processing: ProcessingSettings;
  export: ExportSettings;
  general: GeneralSettings;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionState {
  hasPendingSession: boolean;
  queueSnapshotExists: boolean;
  lastUpdatedAt: number | null;
}

// ---------------------------------------------------------------------------
// Runtime Messages
// ---------------------------------------------------------------------------

export type RuntimeMessage =
  // Lifecycle
  | { type: "PING" }
  | { type: "GET_PAGE_STATE" }
  | { type: "PAGE_STATE_RESULT"; onShutterstock: boolean; onNotSubmitted: boolean; url: string }

  // Portfolio scanning
  | { type: "SCAN_PORTFOLIO" }
  | { type: "PORTFOLIO_SCANNED"; assets: ScannedAsset[] }
  | { type: "PORTFOLIO_CHANGED"; assets: ScannedAsset[] }

  // Asset automation steps (background → content)
  | { type: "OPEN_ASSET"; index: number }
  | { type: "ASSET_OPENED"; success: boolean; error?: string }
  | { type: "WAIT_EDITOR" }
  | { type: "EDITOR_READY"; success: boolean; error?: string }
  | { type: "EXTRACT_PREVIEW"; index: number }
  | { type: "PREVIEW_EXTRACTED"; imageBase64: string | null; mimeType: string; error?: string }
  | { type: "FILL_METADATA"; metadata: GeneratedMetadata }
  | { type: "FILL_METADATA_RESULT"; success: boolean; error?: string; details?: Record<string, boolean> }
  | { type: "VALIDATE_METADATA" }
  | { type: "VALIDATION_RESULT"; valid: boolean; missingFields: string[] }

  // Navigation
  | { type: "NAVIGATE_TO_NOT_SUBMITTED" }
  | { type: "NEXT_PAGE" }
  | { type: "NEXT_PAGE_RESULT"; success: boolean; error?: string }

  // Queue management
  | { type: "START_PROCESSING" }
  | { type: "PAUSE_PROCESSING" }
  | { type: "RESUME_PROCESSING" }
  | { type: "STOP_PROCESSING" }
  | { type: "CLEAR_QUEUE" }
  | { type: "RETRY_FAILED" }
  | { type: "SKIP_CURRENT" }
  | { type: "RESTART_QUEUE" }
  | { type: "GET_QUEUE_SNAPSHOT" }
  | { type: "QUEUE_UPDATED"; snapshot: QueueSnapshot }
  | { type: "OPEN_SHUTTERSTOCK" }
  | { type: "SETTINGS_UPDATED"; settings: AppSettings }

  // Legacy (kept for transition)
  | { type: "SCAN_QUEUE" }
  | { type: "QUEUE_SCANNED"; items: QueueItemDom[] }
  | {
      type: "FILL_ROW";
      rowIndex: number;
      metadata: GeneratedMetadata;
      itemId: string;
    }
  | { type: "FILL_ROW_RESULT"; itemId: string; success: boolean; error?: string }
  | { type: "APPLY_ZOOM"; zoomLevel: ZoomLevel }

  // Live logging
  | { type: "LOG_ENTRY"; entry: LogEntry };

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

export interface GeminiVisionRequest {
  imageBase64: string;
  mimeType: string;
  fileName: string;
  categoryList: CategoryOption[];
  minKeywords: number;
  maxKeywords: number;
}

export interface GeminiVisionResult {
  ok: true;
  metadata: GeneratedMetadata;
}

export interface GeminiVisionError {
  ok: false;
  errorType: "rate_limit" | "invalid_key" | "network" | "parse" | "unknown";
  message: string;
  retryable: boolean;
}

export type GeminiVisionResponse = GeminiVisionResult | GeminiVisionError;
