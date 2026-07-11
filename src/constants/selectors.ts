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

  /** Title input in the editor (Shutterstock calls this "Description" or "Title"). */
  titleField: [
    'input[data-automation="title-input"]',
    'input[data-automation="description-input"]',
    'input[name="title"]',
    'input[name="description"]',
    'input[aria-label*="Title" i]',
    'input[aria-label*="Description" i]',
    'input[placeholder*="title" i]',
    'input[placeholder*="description" i]',
  ],

  /** Description textarea in the editor. */
  descriptionField: [
    'textarea[data-automation="description-input"]',
    'textarea[data-automation="description-textarea"]',
    'textarea[name="description"]',
    'textarea[aria-label*="Description" i]',
    'textarea[placeholder*="description" i]',
  ],

  /** Keywords input field. */
  keywordsField: [
    'input[data-automation="keywords-input"]',
    'input[name="keywords"]',
    '[data-automation="keywords-container"] input',
    'input[aria-label*="Keyword" i]',
    'input[placeholder*="keyword" i]',
  ],

  /** Keyword chips (already added keywords). */
  keywordChip: [
    '[data-automation="keyword-chip"]',
    '[class*="KeywordChip"]',
    '[class*="keyword-chip"]',
    '[class*="tag-chip"]',
  ],

  /** Remove button on keyword chips. */
  keywordChipRemoveButton: [
    '[data-automation="keyword-chip-remove"]',
    'button[aria-label*="Remove" i]',
    '[class*="KeywordChip"] button',
    '[class*="keyword-chip"] button',
  ],

  /** Primary category dropdown. */
  primaryCategoryField: [
    'select[data-automation="category-one"]',
    'select[data-automation="category-select-primary"]',
    'select[name="category1"]',
    'select[aria-label*="Category 1" i]',
    'select[aria-label*="Primary" i]',
  ],

  /** Secondary category dropdown. */
  secondaryCategoryField: [
    'select[data-automation="category-two"]',
    'select[data-automation="category-select-secondary"]',
    'select[name="category2"]',
    'select[aria-label*="Category 2" i]',
    'select[aria-label*="Secondary" i]',
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

/**
 * Try each selector in a group, in order, scoped to `root`, returning the
 * first match. Keeps the content script resilient to markup changes.
 */
export function queryFirst<T extends Element = Element>(
  group: readonly string[],
  root: ParentNode = document
): T | null {
  for (const selector of group) {
    try {
      const el = root.querySelector<T>(selector);
      if (el) return el;
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
      if (els.length > 0) return Array.from(els);
    } catch {
      // try next selector
    }
  }
  return [];
}
