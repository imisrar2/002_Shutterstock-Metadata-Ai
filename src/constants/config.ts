import type { AppSettings } from "@/types";

/** The primary page the extension operates on. */
export const NOT_SUBMITTED_URL =
  "https://submit.shutterstock.com/portfolio/not_submitted/photo";

export const SHUTTERSTOCK_HOST = "submit.shutterstock.com";

/** Legacy alias — kept so existing imports don't break during transition. */
export const SHUTTERSTOCK_UPLOAD_URL = NOT_SUBMITTED_URL;

export const GEMINI_MODEL = "gemini-2.5-flash";

export const GEMINI_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

/** Cooldown applied to an API key immediately after a 429 rate-limit hit. */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Cooldown applied after a transient (5xx/network) failure. */
export const TRANSIENT_FAILURE_COOLDOWN_MS = 10_000;

/** A key is auto-disabled after this many consecutive hard failures. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Breathing room between processing two consecutive assets (ms). */
export const AUTOMATION_DELAY_BETWEEN_ASSETS_MS = 500;

/** Maximum time to wait for the editor to become ready (ms). */
export const EDITOR_READY_TIMEOUT_MS = 30_000;

/** Maximum time to wait for a single DOM element to appear (ms). */
export const ELEMENT_WAIT_TIMEOUT_MS = 15_000;

export const DEFAULT_SETTINGS: AppSettings = {
  workspace: {
    zoomLevel: 70,
    autoOpenSidePanel: true,
  },
  processing: {
    fillMode: "auto",
    maxRetries: 3,
    minKeywords: 25,
    maxKeywords: 50,
    requestTimeoutMs: 30_000,
  },
  export: {
    includeFailedItems: false,
    filenamePrefix: "shutterstock-metadata",
  },
  general: {
    theme: "dark",
    notifyOnComplete: true,
  },
};

export const STORAGE_KEYS = {
  API_KEYS: "ssai_api_keys",
  SETTINGS: "ssai_settings",
  QUEUE_SNAPSHOT: "ssai_queue_snapshot",
  SESSION_FLAG: "ssai_session_active",
} as const;
