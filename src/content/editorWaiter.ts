/**
 * Editor Readiness Waiter
 *
 * After clicking an asset card, the Shutterstock editor panel loads
 * asynchronously. This module waits until ALL required form elements
 * are present in the DOM using MutationObserver — NO hardcoded timeouts.
 */
import { SELECTORS, queryFirst } from "@/constants/selectors";
import { EDITOR_READY_TIMEOUT_MS } from "@/constants/config";
import { createLogger } from "@/utils/logger";

const log = createLogger("editorWaiter");

export interface EditorElements {
  previewImage: HTMLImageElement;
  titleField: HTMLInputElement | null;
  descriptionField: HTMLTextAreaElement | null;
  keywordsField: HTMLInputElement;
  primaryCategory: HTMLSelectElement | null;
  secondaryCategory: HTMLSelectElement | null;
}

interface ProgressCallback {
  (message: string): void;
}

/**
 * Returns a promise that resolves once the editor panel has fully loaded
 * and all required form elements exist in the DOM.
 *
 * Uses MutationObserver internally — never setTimeout for waiting.
 * Has a hard upper limit to avoid infinite waits.
 *
 * @param onProgress - Optional callback for progress updates (e.g. "Waiting for keywords field...")
 * @param timeoutMs - Maximum time to wait before rejecting
 */
export function waitForEditorReady(
  onProgress?: ProgressCallback,
  timeoutMs: number = EDITOR_READY_TIMEOUT_MS
): Promise<EditorElements> {
  return new Promise<EditorElements>((resolve, reject) => {
    // Check immediately — the editor may already be loaded
    const immediate = checkAllElements();
    if (immediate) {
      log.debug("Editor elements already present.");
      resolve(immediate);
      return;
    }

    let observer: MutationObserver | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    // Hard timeout to prevent infinite waits
    timeoutHandle = setTimeout(() => {
      cleanup();
      const missing = getMissingElements();
      reject(
        new Error(
          `Editor did not become ready within ${timeoutMs}ms. Missing: ${missing.join(", ")}`
        )
      );
    }, timeoutMs);

    // Track which elements we've already reported progress for
    const reportedElements = new Set<string>();

    observer = new MutationObserver(() => {
      // Report incremental progress
      if (onProgress) {
        reportProgress(onProgress, reportedElements);
      }

      const result = checkAllElements();
      if (result) {
        cleanup();
        log.debug("All editor elements detected.");
        resolve(result);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "value", "class"],
    });

    // Also report initial progress
    if (onProgress) {
      reportProgress(onProgress, reportedElements);
    }
  });
}

/**
 * Waits for a single element matching any selector in the group to appear.
 */
export function waitForElement<T extends Element = Element>(
  selectorGroup: readonly string[],
  timeoutMs: number = EDITOR_READY_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const existing = queryFirst<T>(selectorGroup);
    if (existing) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      observer?.disconnect();
      observer = null;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error(`Element not found within ${timeoutMs}ms`));
    }, timeoutMs);

    observer = new MutationObserver(() => {
      const el = queryFirst<T>(selectorGroup);
      if (el) {
        cleanup();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Checks whether all required editor elements are present.
 * Returns them if all are found, null otherwise.
 *
 * Required: at least one of title/description, and keywords.
 * Preview image is optional — it will be extracted separately in the
 * EXTRACT_PREVIEW step which has its own fallback logic.
 */
function checkAllElements(): EditorElements | null {
  const previewImage = queryFirst<HTMLImageElement>(SELECTORS.editorPreviewImage);
  const titleField = queryFirst<HTMLInputElement>(SELECTORS.titleField);
  const descriptionField = queryFirst<HTMLTextAreaElement>(SELECTORS.descriptionField);
  const keywordsField = queryFirst<HTMLInputElement>(SELECTORS.keywordsField);
  const primaryCategory = queryFirst<HTMLSelectElement>(SELECTORS.primaryCategoryField);
  const secondaryCategory = queryFirst<HTMLSelectElement>(SELECTORS.secondaryCategoryField);

  // Must have at least one text field, and keywords
  const hasTextInput = titleField || descriptionField;

  if (!hasTextInput || !keywordsField) {
    return null;
  }

  // Preview image is optional for editor readiness.
  // Include it only if it exists AND has finished loading; otherwise pass null.
  // The EXTRACT_PREVIEW step has its own fallback to get the image from the grid card.
  const loadedPreview =
    previewImage && previewImage.complete && previewImage.naturalWidth > 0
      ? previewImage
      : null;

  return {
    previewImage: loadedPreview as HTMLImageElement,
    titleField,
    descriptionField,
    keywordsField,
    primaryCategory,
    secondaryCategory,
  };
}

function getMissingElements(): string[] {
  const missing: string[] = [];
  if (!queryFirst(SELECTORS.titleField) && !queryFirst(SELECTORS.descriptionField)) {
    missing.push("title/description field");
  }
  if (!queryFirst(SELECTORS.keywordsField)) missing.push("keywords field");
  // Preview image is intentionally NOT listed here — it's optional for readiness.
  // If it's missing or still loading, the EXTRACT_PREVIEW step handles fallback.
  return missing;
}

function reportProgress(
  onProgress: ProgressCallback,
  reported: Set<string>
): void {
  const checks: [string, readonly string[]][] = [
    ["preview image", SELECTORS.editorPreviewImage],
    ["title field", SELECTORS.titleField],
    ["description field", SELECTORS.descriptionField],
    ["keywords field", SELECTORS.keywordsField],
    ["primary category", SELECTORS.primaryCategoryField],
  ];

  for (const [name, selectors] of checks) {
    const el = queryFirst(selectors);
    if (el && !reported.has(name)) {
      reported.add(name);
      onProgress(`✓ Detected: ${name}`);
    } else if (!el && !reported.has(`waiting_${name}`)) {
      reported.add(`waiting_${name}`);
      onProgress(`⏳ Waiting for ${name}...`);
    }
  }
}
