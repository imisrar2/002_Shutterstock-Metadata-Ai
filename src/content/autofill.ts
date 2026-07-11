/**
 * Metadata Autofill
 *
 * Writes AI-generated metadata into the Shutterstock editor form fields
 * using native browser events so the React SPA picks up the changes
 * exactly as if the user typed them manually.
 */
import { SELECTORS, queryAll, queryFirst } from "@/constants/selectors";
import { findCategoryById } from "@/constants/categories";
import type { GeneratedMetadata } from "@/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("autofill");

export interface FillResult {
  success: boolean;
  error?: string;
  details: Record<string, boolean>;
}

/**
 * React-controlled inputs ignore a plain `.value = x` assignment because
 * React's internal value tracker doesn't see the native setter fire. Using
 * the prototype's native setter, then dispatching real events, makes React
 * (and most other frameworks) pick up the change exactly like a real
 * keystroke would.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  const hasOption = Array.from(el.options).some((o) => o.value === value);
  if (!hasOption) return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

async function clearExistingKeywords(scope: ParentNode): Promise<void> {
  const removeButtons = queryAll<HTMLButtonElement>(
    SELECTORS.keywordChipRemoveButton,
    scope
  );
  for (const btn of removeButtons) {
    btn.click();
    // Give the framework's state update a tick to flush before the next click.
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function fillKeywords(
  scope: ParentNode,
  keywords: string[]
): Promise<boolean> {
  const input = queryFirst<HTMLInputElement>(SELECTORS.keywordsField, scope);
  if (!input) return false;

  await clearExistingKeywords(scope);

  for (const keyword of keywords) {
    setNativeValue(input, keyword);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    // Small delay so the tag-input component registers each chip distinctly.
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

/**
 * Fills the title field (if it exists).
 */
function fillTitle(scope: ParentNode, title: string): boolean {
  const titleEl = queryFirst<HTMLInputElement>(SELECTORS.titleField, scope);
  if (!titleEl) return false;
  setNativeValue(titleEl, title);
  log.debug("Filled title field.");
  return true;
}

/**
 * Fills the description textarea (if it exists).
 */
function fillDescription(scope: ParentNode, description: string): boolean {
  const descEl = queryFirst<HTMLTextAreaElement>(SELECTORS.descriptionField, scope);
  if (!descEl) return false;
  setNativeValue(descEl, description);
  log.debug("Filled description field.");
  return true;
}

/**
 * Fills the primary category select.
 */
function fillPrimaryCategory(scope: ParentNode, categoryId: string): boolean {
  const selectEl = queryFirst<HTMLSelectElement>(
    SELECTORS.primaryCategoryField,
    scope
  );
  if (!selectEl) return false;
  const category = findCategoryById(categoryId);
  if (!category) return false;
  return setSelectValue(selectEl, category.id);
}

/**
 * Fills the secondary category select.
 */
function fillSecondaryCategory(
  scope: ParentNode,
  categoryId: string | null
): boolean {
  if (!categoryId) return true; // Not required
  const selectEl = queryFirst<HTMLSelectElement>(
    SELECTORS.secondaryCategoryField,
    scope
  );
  if (!selectEl) return false;
  const category = findCategoryById(categoryId);
  if (!category) return false;
  return setSelectValue(selectEl, category.id);
}

/**
 * Writes all generated metadata into the currently open editor.
 * The editor must already be open and its fields present in the DOM.
 *
 * Dispatches input, change, and blur events on every field so
 * Shutterstock's React app sees the values as user-entered.
 */
export async function fillMetadataForEditor(
  metadata: GeneratedMetadata
): Promise<FillResult> {
  // Determine the scope — try the editor panel first, then fall back to document
  const editorPanel = queryFirst(SELECTORS.editorContainer);
  const scope: ParentNode = editorPanel || document;

  const details: Record<string, boolean> = {
    title: false,
    description: false,
    keywords: false,
    primaryCategory: false,
    secondaryCategory: false,
  };

  // Fill Title
  if (metadata.title) {
    details.title = fillTitle(scope, metadata.title);
  } else {
    details.title = true; // Not required if not generated
  }

  // Fill Description
  if (metadata.description) {
    details.description = fillDescription(scope, metadata.description);
    // If there's no separate title field, try using title field for description
    if (!details.description && !details.title) {
      details.title = fillTitle(scope, metadata.description);
    }
  }

  // Fill Keywords
  details.keywords = await fillKeywords(scope, metadata.keywords);

  // Fill Categories
  details.primaryCategory = fillPrimaryCategory(scope, metadata.primaryCategory);
  details.secondaryCategory = fillSecondaryCategory(
    scope,
    metadata.secondaryCategory
  );

  // Determine overall success: at least text + keywords must succeed
  const textFilled = details.title || details.description;
  const success = textFilled && details.keywords;

  if (success) {
    log.info("Metadata filled successfully.");
  } else {
    const failedFields = Object.entries(details)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    log.warn(`Some fields failed to fill: ${failedFields.join(", ")}`);
  }

  return {
    success,
    error: success ? undefined : "Some required fields could not be filled.",
    details,
  };
}

/**
 * Legacy compatibility wrapper — maps the old row-based API to the new
 * editor-scoped API. The rowIndex is ignored since the editor is already
 * open when this is called.
 */
export async function fillMetadataForRow(
  _rowIndex: number,
  metadata: GeneratedMetadata
): Promise<{ success: boolean; error?: string }> {
  return fillMetadataForEditor(metadata);
}
