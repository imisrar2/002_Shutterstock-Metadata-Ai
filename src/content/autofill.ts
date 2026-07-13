/**
 * Metadata Autofill
 *
 * Writes AI-generated metadata into the Shutterstock editor form fields
 * using native browser events so the React SPA picks up the changes
 * exactly as if the user typed them manually.
 */
import { SELECTORS, queryAll, queryFirst } from "@/constants/selectors";
import { findCategoryById, SHUTTERSTOCK_CATEGORIES } from "@/constants/categories";
import type { GeneratedMetadata } from "@/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("autofill");

export interface FillResult {
  success: boolean;
  verified: boolean;
  error?: string;
  details: Record<string, boolean>;
  /** Human-readable diagnostic lines sent back to the engine for sidepanel logging. */
  diagnostics: string[];
}

// ---------------------------------------------------------------------------
// Native value setter (React-compatible)
// ---------------------------------------------------------------------------

function resolveInput(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }
  return el.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Strategy 1: React 15/16/17 tracker bypass
  const tracker = (el as any)._valueTracker;
  if (tracker) {
    tracker.setValue('');
  }

  // Strategy 2: Prototype setter
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(el, value);

  // Strategy 3: Standard dispatch
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  
  // Also dispatch keyboard events as some textareas ignore change without keystrokes
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
}

async function simulateReactTextInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<boolean> {
  // 1. Focus and select the field natively
  el.focus();
  el.select(); // Select any existing text to be overwritten
  el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20)); // brief pause for React to process focus

  // 2. PRIMARY METHOD: Native Browser Command
  // This commands the browser engine to simulate actual user typing.
  // It automatically bypasses all React trackers and generates events with isTrusted: true.
  const execSuccess = document.execCommand("insertText", false, value);

  // 3. FALLBACK METHOD: Prototype setter bypass (if execCommand is blocked/fails)
  if (!execSuccess) {
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    
    const tracker = (el as any)._valueTracker;
    if (tracker) tracker.setValue('');
    
    setter?.call(el, value);
    
    // Dispatch required events manually
    el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 4. Force state commit via keyboard events
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));

  // 5. Force React 17/18 onBlur handlers to fire
  // React 17+ attaches onBlur to the root via focusout (which bubbles natively, unlike blur)
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  el.blur();

  // Wait until Shutterstock's internal state finishes processing the synthetic events
  await new Promise(r => setTimeout(r, 150));

  return el.value === value;
}

// ---------------------------------------------------------------------------
// Native <select> value setter (multi-strategy fallback)
// ---------------------------------------------------------------------------

function setSelectValue(el: HTMLSelectElement, value: string, label?: string): boolean {
  const options = Array.from(el.options);
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\/\-&,]+/g, " ").replace(/\s+/g, " ").trim();

  let match =
    options.find((o) => o.value === value) ??
    (label ? options.find((o) => o.text.toLowerCase().trim() === label.toLowerCase().trim()) : undefined) ??
    options.find((o) => normalize(o.text) === normalize(value)) ??
    (label ? options.find((o) => normalize(o.text) === normalize(label)) : undefined) ??
    (label ? options.find((o) => o.text.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(o.text.toLowerCase().trim())) : undefined);

  if (!match) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(el, match.value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

// ---------------------------------------------------------------------------
// Scope resolver
// ---------------------------------------------------------------------------

function resolveScope(diag: string[]): ParentNode {
  const editorPanel = queryFirst(SELECTORS.editorContainer);

  if (!editorPanel) {
    diag.push("scope: editorContainer not found, using document");
    return document;
  }

  const hasTitle =
    !!queryFirst(SELECTORS.titleField, editorPanel) ||
    !!queryFirst(SELECTORS.descriptionField, editorPanel);
  const hasKeywords = !!queryFirst(SELECTORS.keywordsField, editorPanel);

  if (!hasTitle && !hasKeywords) {
    diag.push(`scope: editorContainer found but fields not inside — falling back to document`);
    return document;
  }

  diag.push(`scope: editorContainer (hasTitle=${hasTitle}, hasKeywords=${hasKeywords})`);
  return editorPanel;
}

// ---------------------------------------------------------------------------
// Custom-dropdown category fill (click-based)
// Shutterstock uses a custom React combobox, not a native <select>.
// ---------------------------------------------------------------------------

function normText(s: string) {
  return s.toLowerCase().replace(/[\/\-&,\s]+/g, " ").trim();
}

/**
 * Finds the dropdown trigger element for Category 1 or Category 2.
 *
 * Shutterstock's category dropdowns are custom React comboboxes. The
 * strategy is:
 *  1. Look for ARIA comboboxes / buttons with aria-haspopup
 *  2. Look for elements near a "Category" label in the DOM
 *  3. Fall back to the Nth combobox-like element on the page
 */
function findCategoryTrigger(
  categoryIndex: 1 | 2,
  diag: string[]
): HTMLElement | null {
  // Collect all interactive dropdown-like elements
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="combobox"], [role="button"][aria-haspopup], button[aria-expanded], ' +
      '[aria-haspopup="listbox"], [aria-haspopup="true"], select'
    )
  );

  // Also look for any element containing "Category" in placeholder/label/text
  const labelTexts = [`category ${categoryIndex}`, `category${categoryIndex}`];
  if (categoryIndex === 1) labelTexts.push("category 1", "category1", "category");

  // Strategy 1: find a <label> or legend whose text contains "Category N",
  // then find the associated interactive control
  const allLabels = Array.from(
    document.querySelectorAll<HTMLElement>("label, legend, [class*='label' i], [class*='Label']")
  );

  for (const lbl of allLabels) {
    const lblText = normText(lbl.textContent ?? "");
    const isMatch = labelTexts.some((t) => lblText === normText(t) || lblText.startsWith(normText(t)));
    if (!isMatch) continue;

    // Check for htmlFor association
    const forId = (lbl as HTMLLabelElement).htmlFor;
    if (forId) {
      const ctrl = document.getElementById(forId) as HTMLElement | null;
      if (ctrl) {
        diag.push(`cat${categoryIndex} trigger: found via label[for="${forId}"]`);
        return ctrl;
      }
    }

    // Look inside the same parent container
    const parent = lbl.parentElement;
    if (parent) {
      const ctrl = parent.querySelector<HTMLElement>(
        '[role="combobox"], [role="button"][aria-haspopup], select, button'
      );
      if (ctrl && ctrl !== lbl) {
        diag.push(`cat${categoryIndex} trigger: found inside label's parent`);
        return ctrl;
      }
      // Look in next sibling
      const sibling = lbl.nextElementSibling as HTMLElement | null;
      if (sibling && sibling.tagName !== "LABEL") {
        diag.push(`cat${categoryIndex} trigger: using label's next sibling`);
        return sibling;
      }
    }
  }

  // Strategy 2: find combobox by ARIA index (1st = primary, 2nd = secondary)
  const comboboxes = Array.from(
    document.querySelectorAll<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"]')
  );
  if (comboboxes.length >= categoryIndex) {
    diag.push(`cat${categoryIndex} trigger: using combobox[${categoryIndex - 1}] (${comboboxes.length} found)`);
    return comboboxes[categoryIndex - 1];
  }

  // Strategy 3: fall back to native <select> at that index
  const selects = Array.from(document.querySelectorAll<HTMLElement>("select"));
  if (selects.length >= categoryIndex) {
    diag.push(`cat${categoryIndex} trigger: using select[${categoryIndex - 1}] (fallback)`);
    return selects[categoryIndex - 1];
  }

  diag.push(`cat${categoryIndex} trigger: not found`);
  return null;
}

/**
 * Selects a category by clicking the trigger, waiting for the dropdown to
 * open, then clicking the matching option.
 *
 * Works with Shutterstock's custom React combobox as seen in the UI.
 */
async function fillCategoryByClick(
  categoryLabel: string,
  categoryIndex: 1 | 2,
  diag: string[]
): Promise<boolean> {
  const trigger = findCategoryTrigger(categoryIndex, diag);
  if (!trigger) return false;

  // If it's a native <select>, use native setter directly
  if (trigger instanceof HTMLSelectElement) {
    const category = SHUTTERSTOCK_CATEGORIES.find(
      (c) => normText(c.label) === normText(categoryLabel)
    );
    if (category) {
      const ok = setSelectValue(trigger, category.id, category.label);
      diag.push(`cat${categoryIndex}: native select → "${categoryLabel}" ${ok ? "✓" : "✗ no match"}`);
      return ok;
    }
    return false;
  }

  // Click to open the custom dropdown
  trigger.focus();
  trigger.click();
  trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 350));

  // Find matching option in the opened dropdown
  // Options may be rendered in a portal (appended to <body>) or inside the trigger's container.
  const optionSelectors = [
    '[role="option"]',
    '[role="listbox"] [role="option"]',
    'ul[role="listbox"] li',
    '[role="listbox"] li',
    'ul li[data-value]',
    'ul li',
    '[class*="option" i]',
    '[class*="Option" i]',
    '[class*="item" i][role]',
    '[class*="dropdown" i] li',
    '[class*="Dropdown" i] li',
  ];

  const targetNorm = normText(categoryLabel);

  for (const sel of optionSelectors) {
    let opts: HTMLElement[] = [];
    try {
      opts = Array.from(document.querySelectorAll<HTMLElement>(sel));
    } catch {
      continue;
    }
    if (opts.length === 0) continue;

    const match = opts.find((o) => normText(o.textContent ?? "") === targetNorm);
    if (match) {
      match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      match.click();
      match.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      diag.push(`cat${categoryIndex}: clicked "${categoryLabel}" via [${sel}] ✓`);
      return true;
    }
  }

  // Couldn't find option — dump what's visible for debugging
  const visibleOptions = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"], [role="listbox"] *, ul li')
  )
    .slice(0, 10)
    .map((o) => `"${o.textContent?.trim()}"`)
    .join(", ");
  diag.push(`cat${categoryIndex}: option "${categoryLabel}" not found. Visible: ${visibleOptions || "(none)"}`);

  // Close dropdown
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  return false;
}

// ---------------------------------------------------------------------------
// Field fillers
// ---------------------------------------------------------------------------

async function fillDescription(scope: ParentNode, description: string, diag: string[]): Promise<boolean> {
  const wrapper = queryFirst<HTMLElement>(SELECTORS.descriptionField, scope);
  const el = wrapper ? resolveInput(wrapper) : null;
  if (!el) { diag.push("description: field not found"); return false; }
  const success = await simulateReactTextInput(el, description);
  diag.push(`description: filled ${success ? "✓" : "✗"}`);
  return success;
}

async function clearExistingKeywords(scope: ParentNode): Promise<void> {
  const removeButtons = queryAll<HTMLButtonElement>(SELECTORS.keywordChipRemoveButton, scope);
  for (const btn of removeButtons) {
    btn.click();
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function fillKeywords(
  scope: ParentNode,
  keywords: string[],
  diag: string[]
): Promise<boolean> {
  if (!keywords || keywords.length === 0) return false;

  const wrapper = queryFirst<HTMLElement>(SELECTORS.keywordsField, scope);
  const input = wrapper ? resolveInput(wrapper) : null;
  if (!input) {
    diag.push("keywords: field not found");
    return false;
  }

  await clearExistingKeywords(scope);
  input.focus();
  await new Promise((r) => setTimeout(r, 50));

  // Paste all keywords as a single comma-separated string
  const keywordString = keywords.join(", ");
  setNativeValue(input, keywordString);
  
  // Dispatch Enter to trigger Shutterstock's chip-creation logic
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup",  { key: "Enter", keyCode: 13, bubbles: true }));
  
  // Dispatch a blur event, which also often triggers chip creation
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));

  diag.push(`keywords: pasted ${keywords.length} keywords as a single string ✓`);
  return true;
}

async function fillPrimaryCategory(
  categoryId: string,
  diag: string[]
): Promise<boolean> {
  const category = findCategoryById(categoryId);
  if (!category) {
    diag.push(`primaryCategory: unknown id "${categoryId}"`);
    return false;
  }
  return fillCategoryByClick(category.label, 1, diag);
}

async function fillSecondaryCategory(
  categoryId: string | null,
  diag: string[]
): Promise<boolean> {
  if (!categoryId) return true;
  const category = findCategoryById(categoryId);
  if (!category) return true;
  return fillCategoryByClick(category.label, 2, diag);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Save Verification
// ---------------------------------------------------------------------------

async function waitForSaveCompletion(saveBtn: HTMLButtonElement, diag: string[]): Promise<boolean> {
  diag.push(`save: waiting for completion...`);
  
  // Wait for the button to indicate saving (e.g. disabled)
  await new Promise((r) => setTimeout(r, 200)); 

  return new Promise((resolve) => {
    let timeoutId: any;
    
    // Check if it's already done (not disabled and no spinner)
    const isDone = () => {
      const isDisabled = saveBtn.hasAttribute("disabled") || saveBtn.classList.contains("disabled");
      const hasSpinner = saveBtn.querySelector('[class*="spinner"], [class*="loader"]');
      return !isDisabled && !hasSpinner;
    };

    if (isDone()) {
      diag.push(`save: completed immediately ✓`);
      return resolve(true);
    }

    const observer = new MutationObserver(() => {
      if (isDone()) {
        observer.disconnect();
        clearTimeout(timeoutId);
        diag.push(`save: completed ✓`);
        resolve(true);
      }
    });

    observer.observe(saveBtn, { attributes: true, childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback timeout just in case it hangs
    timeoutId = setTimeout(() => {
      observer.disconnect();
      diag.push(`save: timeout waiting for completion (assumed done)`);
      resolve(true); // Still proceed to verification
    }, 10_000);
  });
}

function verifyFieldsRetained(scope: ParentNode, expectedMetadata: GeneratedMetadata, diag: string[]): boolean {
  diag.push(`verify: checking retained fields...`);
  let isValid = true;

  // 1. Check Title / Description
  const textToWrite = expectedMetadata.description || expectedMetadata.title || "";
  const titleWrapper = queryFirst<HTMLElement>(SELECTORS.titleField, scope);
  const titleInput = titleWrapper ? resolveInput(titleWrapper) : null;
  const descriptionWrapper = queryFirst<HTMLElement>(SELECTORS.descriptionField, scope);
  const descriptionInput = descriptionWrapper ? resolveInput(descriptionWrapper) : null;

  const currentTitle = titleInput?.value || "";
  const currentDesc = descriptionInput?.value || "";
  
  // If we wrote to description input, it must not be empty. If we wrote to title input, it must not be empty.
  if (expectedMetadata.description && descriptionInput && !currentDesc.trim()) {
    diag.push(`verify: failed - description is empty`);
    isValid = false;
  } else if (!descriptionInput && titleInput && !currentTitle.trim()) {
    diag.push(`verify: failed - title/description is empty`);
    isValid = false;
  }

  // 2. Check Keywords
  const chips = queryAll<HTMLElement>(SELECTORS.keywordChip, scope);
  if (expectedMetadata.keywords.length > 0 && chips.length === 0) {
    diag.push(`verify: failed - keyword chips disappeared`);
    isValid = false;
  }

  if (isValid) {
    diag.push(`verify: all fields retained ✓`);
  }
  return isValid;
}

// ---------------------------------------------------------------------------
// Editor fill orchestrator
// ---------------------------------------------------------------------------

export async function fillMetadataForEditor(
  metadata: GeneratedMetadata
): Promise<FillResult> {
  const diag: string[] = [];
  const scope = resolveScope(diag);

  const details: Record<string, boolean> = {
    title: false,
    description: false,
    keywords: false,
    primaryCategory: false,
    secondaryCategory: true,
  };

  // Try to fill description textarea first
  details.description = metadata.description ? await fillDescription(scope, metadata.description, diag) : false;

  if (details.description) {
    // Textarea exists, fill the title input with title
    details.title = metadata.title ? await fillTitle(scope, metadata.title, diag) : true;
  } else {
    // No textarea found. Shutterstock only has one input field.
    // Fill it with the long description so it passes the 5-word limit.
    const textToWrite = metadata.description || metadata.title || "";
    details.title = textToWrite ? await fillTitle(scope, textToWrite, diag) : true;
    details.description = details.title;
  }

  const textFilled = details.title || details.description;
  
  if (!textFilled) {
    diag.push(`abort: text field synchronization failed`);
    log.info(`fillMetadataForEditor aborted. ${diag.join(" | ")}`);
    return {
      success: false,
      verified: false,
      error: "Text field failed to synchronize with React state.",
      details,
      diagnostics: diag,
    };
  }

  // Fill keywords
  details.keywords = await fillKeywords(scope, metadata.keywords, diag);

  // Fill categories — best-effort, click-based, never blocks success
  details.primaryCategory = await fillPrimaryCategory(metadata.primaryCategory, diag);
  details.secondaryCategory = await fillSecondaryCategory(metadata.secondaryCategory, diag);

  const success = textFilled && details.keywords;
  let verified = false;

  // Click the Save button
  let saveBtn = queryFirst<HTMLButtonElement>(SELECTORS.saveButton, scope);
  if (!saveBtn) {
    // Fallback: search for any button containing "Save" text
    const allBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    saveBtn = allBtns.find(b => b.textContent?.trim().toLowerCase() === 'save') || null;
  }

  if (saveBtn && success) {
    saveBtn.focus();
    saveBtn.click();
    saveBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    saveBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    diag.push(`save: clicked ✓`);
    
    // Wait using DOM observers instead of fixed delays
    await waitForSaveCompletion(saveBtn, diag);
    
    // Strict verification
    verified = verifyFieldsRetained(scope, metadata, diag);
  } else if (!saveBtn) {
    diag.push(`save: button not found`);
  }

  diag.push(`result: textFilled=${textFilled} keywords=${details.keywords} → success=${success} verified=${verified}`);
  log.info(`fillMetadataForEditor done. ${diag.join(" | ")}`);

  return {
    success: Boolean(success),
    verified,
    error: success ? (!verified ? "Save verification failed. Fields lost." : undefined) : "Some required fields could not be filled.",
    details,
    diagnostics: diag,
  };
}

export async function fillMetadataForRow(
  _rowIndex: number,
  metadata: GeneratedMetadata
): Promise<{ success: boolean; error?: string }> {
  return fillMetadataForEditor(metadata);
}
