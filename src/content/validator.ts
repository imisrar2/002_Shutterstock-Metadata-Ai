/**
 * Metadata Validator
 *
 * After autofill, this module verifies that every required field in the
 * Shutterstock editor actually contains data. Returns a detailed report
 * so the automation engine knows whether to proceed or retry.
 */
import { SELECTORS, queryFirst, queryAll } from "@/constants/selectors";
import { createLogger } from "@/utils/logger";

const log = createLogger("validator");

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  details: Record<string, { present: boolean; hasValue: boolean }>;
}

/**
 * Checks that all required editor fields contain non-empty values.
 * Called after fillMetadataForEditor() to confirm the autofill stuck.
 */
export function validateFilledMetadata(): ValidationResult {
  let editorPanel = queryFirst(SELECTORS.editorContainer);
  const hasFields = editorPanel && (queryFirst(SELECTORS.titleField, editorPanel) || queryFirst(SELECTORS.descriptionField, editorPanel) || queryFirst(SELECTORS.keywordsField, editorPanel));
  const scope: ParentNode = hasFields ? editorPanel : document;

  const details: Record<string, { present: boolean; hasValue: boolean }> = {};
  const missingFields: string[] = [];

  // Check title field
  const titleEl = queryFirst<HTMLInputElement>(SELECTORS.titleField, scope);
  const descEl = queryFirst<HTMLTextAreaElement>(SELECTORS.descriptionField, scope);

  const titlePresent = !!titleEl;
  const titleHasValue = !!titleEl?.value?.trim();
  const descPresent = !!descEl;
  const descHasValue = !!descEl?.value?.trim();

  details["title"] = { present: titlePresent, hasValue: titleHasValue };
  details["description"] = { present: descPresent, hasValue: descHasValue };

  // At least one text field must have content
  if (!titleHasValue && !descHasValue) {
    missingFields.push("title/description");
  }

  // Check keywords — look for chips OR text in the input field
  const keywordChips = queryAll(SELECTORS.keywordChip, scope);
  const keywordsInput = queryFirst<HTMLInputElement>(SELECTORS.keywordsField, scope);
  const keywordsPresent = !!keywordsInput || keywordChips.length > 0;
  
  // Pass if chips exist, OR if the input field itself has a string of keywords typed in
  const keywordsHaveValue = keywordChips.length > 0 || (!!keywordsInput && keywordsInput.value.trim().length > 0);

  details["keywords"] = { present: keywordsPresent, hasValue: keywordsHaveValue };
  if (!keywordsHaveValue) {
    missingFields.push("keywords");
  }

  // Check primary category — informational only, never blocks completion
  const primaryCat = queryFirst<HTMLSelectElement>(
    SELECTORS.primaryCategoryField,
    scope
  );
  const primaryPresent = !!primaryCat;
  const primaryHasValue =
    !!primaryCat?.value && primaryCat.value !== "" && primaryCat.selectedIndex > 0;

  details["primaryCategory"] = {
    present: primaryPresent,
    hasValue: primaryHasValue,
  };
  // Category is intentionally NOT added to missingFields — it should never block completion.
  // Autofill makes a best-effort attempt; the user can always set it manually.

  const valid = missingFields.length === 0;

  if (valid) {
    log.debug("Validation passed — all required fields have values.");
  } else {
    log.warn(`Validation failed — missing: ${missingFields.join(", ")}`);
  }

  return { valid, missingFields, details };
}
