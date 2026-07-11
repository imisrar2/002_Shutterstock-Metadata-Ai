/**
 * Page Observer
 *
 * Continuously monitors the portfolio grid for changes:
 * - Newly added asset cards (uploads, lazy loading)
 * - Removed asset cards (deletions)
 * - Pagination changes
 * - DOM mutations that affect the grid
 *
 * Sends PORTFOLIO_CHANGED messages when the grid changes so the
 * background script can update the queue.
 */
import { SELECTORS, queryFirst, queryAll } from "@/constants/selectors";
import { scanPortfolioGrid } from "./scanner";
import type { RuntimeMessage } from "@/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("pageObserver");

let activeObserver: MutationObserver | null = null;
let lastCardCount = -1;

/**
 * Starts observing the portfolio grid for changes. When the set of
 * visible cards changes, scans the grid and sends a PORTFOLIO_CHANGED
 * message to the background/sidepanel.
 *
 * Returns a cleanup function to disconnect the observer.
 */
export function startPageObserver(): () => void {
  if (activeObserver) {
    log.debug("Page observer already running.");
    return () => stopPageObserver();
  }

  const container =
    queryFirst(SELECTORS.portfolioGrid) ?? document.body;

  lastCardCount = queryAll(SELECTORS.assetCard).length;

  let debounceTimer: number | undefined;

  const debouncedCheck = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const currentCount = queryAll(SELECTORS.assetCard).length;
      if (currentCount !== lastCardCount) {
        lastCardCount = currentCount;
        const assets = scanPortfolioGrid();
        chrome.runtime.sendMessage({
          type: "PORTFOLIO_CHANGED",
          assets,
        } satisfies RuntimeMessage).catch(() => {
          // Side panel / background may not be listening — safe to ignore.
        });
        log.debug(
          `Portfolio changed: ${assets.length} assets (was ${lastCardCount}).`
        );
      }
    }, 800);
  };

  activeObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (m) => m.addedNodes.length > 0 || m.removedNodes.length > 0
    );
    if (relevant) debouncedCheck();
  });

  activeObserver.observe(container, {
    childList: true,
    subtree: true,
  });

  log.debug("Page observer started.");
  return () => stopPageObserver();
}

/**
 * Stops the active page observer and cleans up.
 */
export function stopPageObserver(): void {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
    log.debug("Page observer stopped.");
  }
}

/**
 * Checks if the page has a "Next" pagination button and clicks it.
 * Returns true if navigation was triggered.
 */
export function navigateToNextPage(): boolean {
  const nextBtn = queryFirst<HTMLElement>(SELECTORS.paginationNext);
  if (!nextBtn) {
    log.debug("No 'Next' pagination button found.");
    return false;
  }

  // Check if it's disabled
  if (
    nextBtn.hasAttribute("disabled") ||
    nextBtn.getAttribute("aria-disabled") === "true" ||
    nextBtn.classList.contains("disabled")
  ) {
    log.debug("Pagination 'Next' button is disabled (last page).");
    return false;
  }

  nextBtn.click();
  log.info("Navigated to next page.");
  return true;
}

/**
 * Extracts pagination info from the page if available.
 */
export function getPaginationInfo(): {
  currentPage: number;
  totalPages: number | null;
} {
  const infoEl = queryFirst(SELECTORS.paginationInfo);
  if (!infoEl?.textContent) {
    return { currentPage: 1, totalPages: null };
  }

  const text = infoEl.textContent.trim();

  // Try patterns like "Page 1 of 5", "1/5", "1 of 5"
  const match = text.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (match) {
    return {
      currentPage: parseInt(match[1], 10),
      totalPages: parseInt(match[2], 10),
    };
  }

  // Try just a number
  const numMatch = text.match(/(\d+)/);
  if (numMatch) {
    return {
      currentPage: parseInt(numMatch[1], 10),
      totalPages: null,
    };
  }

  return { currentPage: 1, totalPages: null };
}
