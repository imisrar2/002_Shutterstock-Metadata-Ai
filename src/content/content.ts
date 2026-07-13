/**
 * Content Script — Shutterstock Portfolio Page
 *
 * Acts as a remote executor for commands sent by the background service
 * worker. Each message type maps to a specific content-script module.
 *
 * Injected on: https://submit.shutterstock.com/*
 * Primary target: https://submit.shutterstock.com/portfolio/not_submitted/photo
 */
import { NOT_SUBMITTED_URL } from "@/constants/config";
import type { RuntimeMessage } from "@/types";
import { scanPortfolioGrid, clickAssetCard } from "./scanner";
import { waitForEditorReady } from "./editorWaiter";
import { fillMetadataForEditor } from "./autofill";
import { validateFilledMetadata } from "./validator";
import { startPageObserver, navigateToNextPage, getPaginationInfo } from "./pageObserver";
import { imageElementToBase64, fetchImageAsBase64 } from "@/utils/imageUtils";
import { SELECTORS, queryFirst, queryAll } from "@/constants/selectors";
import { createLogger } from "@/utils/logger";

const log = createLogger("content");

let stopObserving: (() => void) | null = null;

// ---------------------------------------------------------------------------
// URL & Page Check
// ---------------------------------------------------------------------------

function isOnNotSubmittedPage(): boolean {
  return window.location.href.includes("/portfolio/not_submitted");
}

function isOnShutterstockSite(): boolean {
  return window.location.hostname === "submit.shutterstock.com";
}



// ---------------------------------------------------------------------------
// Observer Bootstrap
// ---------------------------------------------------------------------------

function ensurePageObserver(): void {
  if (stopObserving) return;
  stopObserving = startPageObserver();
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        log.error("Error handling message", message.type, err);
        sendResponse({ success: false, error: String(err) });
      });
    return true; // Keep channel open for async response
  }
);

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    // ----- Page State -----
    case "GET_PAGE_STATE":
      ensurePageObserver();
      return {
        type: "PAGE_STATE_RESULT",
        onShutterstock: isOnShutterstockSite(),
        onNotSubmitted: isOnNotSubmittedPage(),
        url: window.location.href,
      };

    // ----- Portfolio Scanning -----
    case "SCAN_PORTFOLIO": {
      ensurePageObserver();
      const assets = scanPortfolioGrid();
      return { type: "PORTFOLIO_SCANNED", assets };
    }

    // Legacy compatibility
    case "SCAN_QUEUE": {
      ensurePageObserver();
      const assets = scanPortfolioGrid();
      // Convert to legacy format
      const items = assets.map((a) => ({
        rowIndex: a.index,
        fileName: a.name,
        thumbnailDataUrl: a.thumbnailUrl,
      }));
      return { type: "QUEUE_SCANNED", items };
    }

    // ----- Asset Automation Steps -----
    case "OPEN_ASSET": {
      const success = clickAssetCard(message.index);
      return {
        type: "ASSET_OPENED",
        success,
        error: success ? undefined : `Could not click asset at index ${message.index}`,
      };
    }

    case "WAIT_EDITOR": {
      try {
        await waitForEditorReady((progressMsg) => {
          // Send progress messages back (fire-and-forget)
          chrome.runtime
            .sendMessage({
              type: "LOG_ENTRY",
              entry: { timestamp: Date.now(), message: progressMsg, level: "info" },
            } satisfies RuntimeMessage)
            .catch(() => {});
        });
        return { type: "EDITOR_READY", success: true };
      } catch (err) {
        return {
          type: "EDITOR_READY",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "EXTRACT_PREVIEW": {
      if (!("index" in message)) return null;
      let previewImg = queryFirst<HTMLImageElement>(SELECTORS.editorPreviewImage);

      // Fallback: If editor preview is missing, try to get the thumbnail from the grid card
      if (!previewImg) {
        const cards = queryAll<HTMLElement>(SELECTORS.assetCard);
        const card = cards[message.index];
        if (card) {
          previewImg = queryFirst<HTMLImageElement>(SELECTORS.assetCardImage, card);
        }
      }

      if (!previewImg) {
        return {
          type: "PREVIEW_EXTRACTED",
          imageBase64: null,
          mimeType: "image/png",
          error: "Preview image element not found.",
        };
      }

      // Wait for the image to be fully loaded
      if (!previewImg.complete || previewImg.naturalWidth === 0) {
        await new Promise<void>((resolve) => {
          previewImg.addEventListener("load", () => resolve(), { once: true });
          // Fallback timeout in case image is already cached
          setTimeout(resolve, 3000);
        });
      }

      // Attempt 1: Canvas draw (works for same-origin or CORS-enabled images)
      let payload = await imageElementToBase64(previewImg);

      // Attempt 2: Direct fetch via fallbackUrl (grid thumbnail)
      if (!payload && message.fallbackUrl) {
        log.warn(`Canvas extraction failed, trying fallback URL: ${message.fallbackUrl}`);
        payload = await fetchImageAsBase64(message.fallbackUrl);
      }

      // Attempt 3: Ask the background service worker to fetch the URL.
      // Background workers are NOT bound by the page-origin CORS policy and can
      // freely reach Shutterstock's CDN — this is the reliable path for EPS files.
      if (!payload) {
        const urlsToTry = [
          previewImg.currentSrc || previewImg.src,
          message.fallbackUrl,
        ].filter(Boolean) as string[];

        for (const url of urlsToTry) {
          log.warn(`Trying background-proxied fetch for: ${url}`);
          const bgResult = await chrome.runtime.sendMessage({
            type: "FETCH_IMAGE_URL",
            url,
          } satisfies RuntimeMessage).catch(() => null) as {
            type: string;
            base64: string | null;
            mimeType: string;
            error?: string;
          } | null;

          if (bgResult?.base64) {
            payload = { base64: bgResult.base64, mimeType: bgResult.mimeType };
            break;
          }
        }
      }

      if (!payload) {
        return {
          type: "PREVIEW_EXTRACTED",
          imageBase64: null,
          mimeType: "image/png",
          error: "Could not extract image data from preview.",
        };
      }

      return {
        type: "PREVIEW_EXTRACTED",
        imageBase64: payload.base64,
        mimeType: payload.mimeType,
      };
    }

    case "FILL_METADATA": {
      const result = await fillMetadataForEditor(message.metadata);
      return {
        type: "FILL_METADATA_RESULT",
        success: result.success,
        error: result.error,
        details: result.details,
        diagnostics: result.diagnostics,
      };
    }

    case "VALIDATE_METADATA": {
      const validation = validateFilledMetadata();
      return {
        type: "VALIDATION_RESULT",
        valid: validation.valid,
        missingFields: validation.missingFields,
      };
    }

    // ----- Navigation -----
    case "NAVIGATE_TO_NOT_SUBMITTED":
      window.location.href = NOT_SUBMITTED_URL;
      return { success: true };

    case "NEXT_PAGE": {
      const navigated = navigateToNextPage();
      return {
        type: "NEXT_PAGE_RESULT",
        success: navigated,
        error: navigated ? undefined : "No 'Next' button found or already on last page.",
      };
    }

    // ----- Legacy -----


    case "FILL_ROW": {
      const fillResult = await fillMetadataForEditor(message.metadata);
      return {
        type: "FILL_ROW_RESULT",
        itemId: message.itemId,
        success: fillResult.success,
        error: fillResult.error,
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

ensurePageObserver();

log.info(
  `Content script loaded. On Not Submitted page: ${isOnNotSubmittedPage()}. URL: ${window.location.href}`
);
