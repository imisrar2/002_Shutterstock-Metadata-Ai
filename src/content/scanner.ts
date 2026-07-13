/**
 * Portfolio Grid Scanner
 *
 * Detects every visible asset card on the "Not Submitted" portfolio page
 * and returns a lightweight descriptor for each one. Asset-type agnostic:
 * photos, illustrations, EPS, vectors, PNG, JPG are all treated the same.
 */
import { SELECTORS, queryAll, queryFirst } from "@/constants/selectors";
import type { ScannedAsset } from "@/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("scanner");

/**
 * Scans the portfolio grid and returns a ScannedAsset for every visible card.
 * Handles lazy-loaded thumbnails gracefully — if a thumbnail hasn't loaded
 * yet, its URL is captured anyway; base64 extraction happens later when the
 * editor preview is available (higher quality).
 */
export function scanPortfolioGrid(): ScannedAsset[] {
  const cards = queryAll<HTMLElement>(SELECTORS.assetCard);
  const results: ScannedAsset[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    // Try to extract a name from the card
    const img = queryFirst<HTMLImageElement>(SELECTORS.assetCardImage, card);
    const name = extractAssetName(card, img, i);

    // Thumbnail URL (not base64 yet — we grab the hi-res preview later)
    const thumbnailUrl = img?.src || img?.currentSrc || null;

    // Build a stable-ish card identifier
    const cardId = buildCardId(card, i, name, thumbnailUrl);

    results.push({
      index: i,
      name,
      thumbnailUrl,
      cardId,
    });
  }

  log.debug(`Scanned ${results.length} asset card(s) on portfolio grid.`);
  return results;
}

/**
 * Clicks the asset card at the given index to open its editor.
 * Returns true if the click was dispatched successfully.
 */
export function clickAssetCard(index: number): boolean {
  const cards = queryAll<HTMLElement>(SELECTORS.assetCard);
  const card = cards[index];
  if (!card) {
    log.warn(`Asset card at index ${index} not found (${cards.length} cards on page).`);
    return false;
  }

  // Force deselect any currently selected items to prevent multi-selection bugs.
  const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  let deselectedCount = 0;
  checkboxes.forEach((cb) => {
    if (cb.checked) {
      // Click the parent element if it's a label, otherwise click the checkbox itself
      const clickable = cb.closest('label') || cb.parentElement || cb;
      clickable.click();
      deselectedCount++;
    }
  });

  if (deselectedCount > 0) {
    log.debug(`Cleared ${deselectedCount} existing selections.`);
  }

  // Scroll the card into view first
  card.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });

  // Add processing highlight
  card.classList.add("ssai-processing-highlight");

  // Use native click() as React might ignore synthesized dispatchEvent clicks
  const link = queryFirst<HTMLElement>(SELECTORS.assetCardLink, card);
  const clickTarget = link || card;
  clickTarget.click();
  
  log.debug(`Clicked asset card at index ${index} exclusively.`);
  return true;
}

/**
 * Extracts a human-readable name for the asset from available DOM hints.
 */
function extractAssetName(
  card: HTMLElement,
  img: HTMLImageElement | null,
  index: number
): string {
  // Try aria-label on the card
  const ariaLabel = card.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // Try title attribute
  const titleAttr = card.getAttribute("title");
  if (titleAttr?.trim()) return titleAttr.trim();

  // Try image alt text
  if (img?.alt?.trim()) return img.alt.trim();

  // Try data attributes
  const dataName =
    card.dataset.name || card.dataset.filename || card.dataset.title;
  if (dataName?.trim()) return dataName.trim();

  // Try any text content (but keep it short)
  const textContent = card.textContent?.trim();
  if (textContent && textContent.length < 60) return textContent;

  // Fallback
  return `Asset ${index + 1}`;
}

/**
 * Builds a reasonably stable identifier for an asset card so we can
 * match it across scans even if the DOM shifts slightly.
 */
function buildCardId(
  card: HTMLElement,
  index: number,
  name: string,
  thumbnailUrl: string | null
): string {
  // Prefer data-id or href-based IDs
  const dataId = card.dataset.id || card.dataset.assetId;
  if (dataId) return `card_${dataId}`;

  // Extract from thumbnail URL (highly reliable since the URL contains the Shutterstock asset ID)
  if (thumbnailUrl) {
    const thumbMatch = thumbnailUrl.match(/\/(\d+)\//);
    if (thumbMatch) return `card_${thumbMatch[1]}`;
  }

  const link = queryFirst<HTMLAnchorElement>(SELECTORS.assetCardLink, card);
  if (link?.href) {
    const match = link.href.match(/\/(\d+)\/?$/);
    if (match) return `card_${match[1]}`;
  }

  // Fall back to index (avoiding name because name changes when we update metadata)
  return `card_fallback_${index}`;
}

/**
 * Returns the total number of visible asset cards on the current page.
 */
export function countAssetCards(): number {
  return queryAll(SELECTORS.assetCard).length;
}
