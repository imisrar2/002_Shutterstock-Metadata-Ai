import { STORAGE_KEYS, DEFAULT_SETTINGS, NOT_SUBMITTED_URL } from "@/constants/config";
import type { AppSettings, RuntimeMessage } from "@/types";
import { storageGet, storageSet } from "@/storage/storageService";
import {
  startProcessing,
  pauseProcessing,
  resumeProcessing,
  stopProcessing,
  clearQueue,
  skipCurrent,
  retryFailed,
  restartQueue,
} from "@/queue/queueProcessor";
import { registerAlarms } from "./alarmManager";
import { createLogger } from "@/utils/logger";

const log = createLogger("background");

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet<AppSettings>(STORAGE_KEYS.SETTINGS);
  if (!existing) {
    await storageSet(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }
  log.info("Extension installed / updated.");
});

// Open the side panel when the toolbar icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // When the Shutterstock tab starts navigating (refresh / URL change),
  // immediately stop any running automation. The content script will be
  // destroyed by the navigation, so continuing would only produce errors.
  if (
    changeInfo.status === "loading" &&
    tab.url?.includes("submit.shutterstock.com")
  ) {
    const snap = await storageGet<{ status: string }>(STORAGE_KEYS.QUEUE_SNAPSHOT);
    if (snap && (snap.status === "running" || snap.status === "paused")) {
      log.info("Shutterstock tab is navigating — stopping automation.");
      await stopProcessing();
    }
  }

  if (changeInfo.status !== "complete" || !tab.url) return;
  const isShutterstock = tab.url.includes("submit.shutterstock.com");

  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: true,
  });

  const settings =
    (await storageGet<AppSettings>(STORAGE_KEYS.SETTINGS)) ?? DEFAULT_SETTINGS;
  if (isShutterstock && settings.workspace.autoOpenSidePanel) {
    try {
      await chrome.sidePanel.open({ tabId });
    } catch (err) {
      log.debug(
        "Could not auto-open side panel (likely no user gesture yet).",
        err
      );
    }
  }
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
);

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "PING":
      return { type: "PONG" };

    // ----- Automation controls -----
    case "START_PROCESSING":
      await startProcessing();
      return { ok: true };
    case "PAUSE_PROCESSING":
      await pauseProcessing();
      return { ok: true };
    case "RESUME_PROCESSING":
      await resumeProcessing();
      return { ok: true };
    case "STOP_PROCESSING":
      await stopProcessing();
      return { ok: true };
    case "CLEAR_QUEUE":
      await clearQueue();
      return { ok: true };
    case "SKIP_CURRENT":
      await skipCurrent();
      return { ok: true };
    case "RETRY_FAILED":
      await retryFailed();
      return { ok: true };
    case "RESTART_QUEUE":
      await restartQueue();
      return { ok: true };

    // ----- Navigation -----
    case "OPEN_SHUTTERSTOCK":
      await openOrFocusNotSubmitted();
      return { ok: true };

    default:
      return null;
  }
}

/**
 * Opens or focuses the Not Submitted portfolio page.
 */
async function openOrFocusNotSubmitted(): Promise<void> {
  const [existing] = await chrome.tabs.query({
    url: "https://submit.shutterstock.com/*",
  });
  if (existing?.id) {
    // If already on Shutterstock, navigate to the correct page
    await chrome.tabs.update(existing.id, {
      active: true,
      url: NOT_SUBMITTED_URL,
    });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: NOT_SUBMITTED_URL });
}

registerAlarms();

log.info("Background service worker started.");
