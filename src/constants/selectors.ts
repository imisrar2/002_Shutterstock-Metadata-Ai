/**
 * DOM selectors for the Shutterstock Contributor "Not Submitted" portfolio page.
 *
 * Shutterstock's portfolio pages are React SPAs with hashed class names that
 * change between deploys. Every selector group prefers stable attributes
 * (data-automation, aria-label, role, name) and falls back to structural
 * patterns. Each group is an ordered array; the selector utilities walk
 * through them and return the first match.
 *
 * NOTE: These selectors target the "Not Submitted" portfolio grid and its
 * per-asset editor panel — NOT the old upload page.
 */
export const SELECTORS = {
  /** The main grid/list container holding all asset cards. */
  portfolioGrid: [
    '[data-automation="portfolio-grid"]',
    '[data-automation="asset-grid"]',
    '[class*="PortfolioGrid"]',
    '[class*="AssetGrid"]',
    'div[class*="portfolio"] div[class*="grid"]',
    'main [role="list"]',
    'main',
    'body'
  ],

  /** Individual asset cards/tiles in the portfolio grid. */
  assetCard: [
    '[data-automation="portfolio-item"]',
    '[data-automation="asset-card"]',
    '[data-automation="media-item"]',
    '[data-testid*="asset-card"]',
    '[data-testid*="item-card"]',
    '[class*="PortfolioItem"]',
    '[class*="AssetCard"]',
    '[class*="MuiGrid-item"]',
    '[class*="MuiCard-root"]',
    'div[class*="portfolio"] a[href*="/details/"]',
    'a[href*="/details/"]',
    '[role="listitem"]',
    'li'
  ],

  /** The thumbnail <img> inside each asset card. */
  assetCardImage: [
    '[data-automation="portfolio-item"] img',
    '[data-automation="asset-card"] img',
    '[data-automation="media-item"] img',
    '[class*="PortfolioItem"] img',
    '[class*="AssetCard"] img',
    "img",
  ],

  /** Clickable element on an asset card that opens the editor. */
  assetCardLink: [
    '[data-automation="portfolio-item"] a',
    '[data-automation="asset-card"] a',
    '[class*="PortfolioItem"] a',
    "a[href*='/details/']",
    "a",
  ],

  /** The editor panel / detail view that opens after clicking an asset. */
  editorContainer: [
    '[data-automation="asset-editor"]',
    '[data-automation="edit-panel"]',
    '[data-automation="asset-details"]',
    '[class*="EditPanel"]',
    '[class*="AssetEditor"]',
    '[class*="AssetDetail"]',
    '[class*="DetailPanel"]',
    '[role="dialog"]',
  ],

  /** Large preview image inside the editor. */
  editorPreviewImage: [
    '[data-automation="asset-preview"] img',
    '[data-automation="preview-image"]',
    '[class*="Preview"] img',
    '[class*="preview"] img',
    '[class*="AssetEditor"] img',
    '[class*="DetailPanel"] img',
  ],

  /** Save button in the editor. */
  saveButton: [
    'button[data-automation="save-btn"]',
    'button[data-automation="save-button"]',
    'button[aria-label*="Save" i]',
    'button[data-testid*="save"]',
    'form button[type="submit"]',
  ],

  /** Saving indicator (e.g. loader, disabled save button, saving text). */
  savingIndicator: [
    'button[data-automation="save-btn"][disabled]',
    'button[data-automation="save-button"][disabled]',
    '[data-automation="save-btn"] [class*="spinner"]',
    '[data-automation="save-button"] [class*="spinner"]',
    '[data-automation="saving-indicator"]',
    '[role="status"]',
    '[class*="saving"]',
    '[class*="Saving"]',
    '[class*="loader"]',
    '[class*="Loader"]'
  ],

  /** Title input in the editor (Shutterstock calls this "Description" or "Title"). */
  titleField: [
    '[data-automation*="title" i] input',
    '[data-automation*="description" i] input',
    'input[data-automation*="title" i]',
    'input[data-automation*="description" i]',
    '[name*="title" i]',
    '[name*="description" i]',
    'input[aria-label*="Title" i]',
    'input[aria-label*="Description" i]',
    'input[placeholder*="title" i]',
    'input[placeholder*="description" i]',
    // Removed generic 'textarea' fallback to prevent false positives
  ],

  /** Description textarea in the editor. */
  descriptionField: [
    '[data-automation*="description" i] textarea',
    'textarea[data-automation*="description" i]',
    'textarea[name*="description" i]',
    'textarea[aria-label*="Description" i]',
    'textarea[placeholder*="description" i]',
    // Removed generic 'textarea' fallback to prevent false positives
  ],

  /** Keywords input field. */
  keywordsField: [
    '[data-automation*="keyword" i] input',
    'input[data-automation*="keyword" i]',
    'input[name*="keyword" i]',
    'input[aria-label*="Keyword" i]',
    'input[placeholder*="keyword" i]',
  ],

  /** Keyword chips (already added keywords). */
  keywordChip: [
    '[data-automation*="keyword" i][data-automation*="chip" i]',
    '[data-automation*="keyword" i][data-automation*="item" i]',
    '[class*="KeywordChip" i]',
    '[class*="tag-chip" i]',
    '[data-automation*="keywords" i] li', // structural fallback
    '[class*="keyword" i] li', // structural fallback
  ],

  /** Remove button on keyword chips. */
  keywordChipRemoveButton: [
    '[data-automation*="keyword" i][data-automation*="remove" i]',
    'button[aria-label*="Remove" i]',
    '[class*="KeywordChip" i] button',
    '[class*="tag-chip" i] button',
    '[data-automation*="keywords" i] li button',
  ],

  /** Primary category dropdown. */
  primaryCategoryField: [
    'select[data-automation="category-one"]',
    'select[data-automation="category-select-primary"]',
    'select[data-automation="primary-category"]',
    'select[data-automation="category"]',
    'select[name="category1"]',
    'select[name="category"]',
    'select[name="primaryCategory"]',
    'select[id="category1"]',
    'select[id="category"]',
    'select[aria-label*="Category 1" i]',
    'select[aria-label*="Primary category" i]',
    'select[aria-label*="Primary" i]',
    'select[aria-label*="Category" i]',
    'select[placeholder*="category" i]',
    '[class*="category"] select',
    '[class*="Category"] select',
    '[data-testid*="category"] select',
    'select:first-of-type',
  ],

  /** Secondary category dropdown. */
  secondaryCategoryField: [
    'select[data-automation="category-two"]',
    'select[data-automation="category-select-secondary"]',
    'select[data-automation="secondary-category"]',
    'select[name="category2"]',
    'select[name="secondaryCategory"]',
    'select[id="category2"]',
    'select[aria-label*="Category 2" i]',
    'select[aria-label*="Secondary category" i]',
    'select[aria-label*="Secondary" i]',
    '[class*="category"] select:nth-of-type(2)',
    '[class*="Category"] select:nth-of-type(2)',
    'select:nth-of-type(2)',
  ],

  /** The "Next" pagination link/button. */
  paginationNext: [
    '[data-automation="pagination-next"]',
    'a[aria-label*="Next" i]',
    'button[aria-label*="Next" i]',
    '[class*="Pagination"] a:last-child',
    '[class*="pagination"] button:last-child',
    'a[rel="next"]',
  ],

  /** Page counter element (e.g. "Page 1 of 5"). */
  paginationInfo: [
    '[data-automation="pagination-info"]',
    '[class*="Pagination"] [class*="info"]',
    '[class*="pagination"] span',
  ],
} as const;

export type SelectorGroup = keyof typeof SELECTORS;

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

/**
 * Try each selector in a group, in order, scoped to `root`, returning the
 * first match. Prioritizes visible elements to avoid interacting with hidden
 * React state trackers.
 */
export function queryFirst<T extends Element = Element>(
  group: readonly string[],
  root: ParentNode = document
): T | null {
  for (const selector of group) {
    try {
      const els = root.querySelectorAll<T>(selector);
      if (els.length > 0) {
        // Prefer visible elements
        const visibleEl = Array.from(els).find(isVisible);
        if (visibleEl) return visibleEl;
        
        // Fallback to first if none visible
        return els[0];
      }
    } catch {
      // Invalid selector for this DOM snapshot — skip and try the next one.
    }
  }
  return null;
}

export function queryAll<T extends Element = Element>(
  group: readonly string[],
  root: ParentNode = document
): T[] {
  for (const selector of group) {
    try {
      const els = root.querySelectorAll<T>(selector);
      if (els.length > 0) {
        // Filter out hidden elements if there are visible ones
        const visibleEls = Array.from(els).filter(isVisible);
        return visibleEls.length > 0 ? visibleEls : Array.from(els);
      }
    } catch {
      // try next selector
    }
  }
  return [];
}
