import type { CategoryOption } from "@/types";

/**
 * Shutterstock's official contributor category list.
 *
 * The `id` is the slug we use internally and tell Gemini to return.
 * The `label` is the EXACT text that appears in Shutterstock's category
 * <select> options — this is what setSelectValue uses to match the DOM option.
 *
 * Both id and label are passed to the select matcher so it can find the right
 * option regardless of what numeric/slug value Shutterstock uses internally.
 */
export const SHUTTERSTOCK_CATEGORIES: CategoryOption[] = [
  { id: "abstract",             label: "Abstract" },
  { id: "animals-wildlife",     label: "Animals/Wildlife" },
  { id: "arts",                 label: "Arts" },
  { id: "backgrounds-textures", label: "Backgrounds/Textures" },
  { id: "beauty-fashion",       label: "Beauty/Fashion" },
  { id: "buildings-landmarks",  label: "Buildings/Landmarks" },
  { id: "business-finance",     label: "Business/Finance" },
  { id: "celebrities",          label: "Celebrities" },
  { id: "education",            label: "Education" },
  { id: "food-drink",           label: "Food and drink" },
  { id: "healthcare-medical",   label: "Healthcare/Medical" },
  { id: "holidays",             label: "Holidays" },
  { id: "industrial",           label: "Industrial" },
  { id: "interiors",            label: "Interiors" },
  { id: "miscellaneous",        label: "Miscellaneous" },
  { id: "nature",               label: "Nature" },
  { id: "objects",              label: "Objects" },
  { id: "parks-outdoor",        label: "Parks/Outdoor" },
  { id: "people",               label: "People" },
  { id: "religion",             label: "Religion" },
  { id: "science",              label: "Science" },
  { id: "signs-symbols",        label: "Signs/Symbols" },
  { id: "sports-recreation",    label: "Sports/Recreation" },
  { id: "technology",           label: "Technology" },
  { id: "transportation",       label: "Transportation" },
  { id: "vintage",              label: "Vintage" },
];

export function findCategoryById(id: string | null): CategoryOption | null {
  if (!id) return null;
  // Exact id match
  const byId = SHUTTERSTOCK_CATEGORIES.find((c) => c.id === id);
  if (byId) return byId;
  // Also try matching by label (case-insensitive) — Gemini sometimes returns the label
  const lower = id.toLowerCase().trim();
  return (
    SHUTTERSTOCK_CATEGORIES.find((c) => c.label.toLowerCase() === lower) ?? null
  );
}

/**
 * Accepts both id slugs and label strings.
 * Normalises by stripping slashes/hyphens so "animals-wildlife" matches "Animals/Wildlife".
 */
export function isValidCategoryId(id: string): boolean {
  if (!id) return false;
  if (SHUTTERSTOCK_CATEGORIES.some((c) => c.id === id)) return true;
  const lower = id.toLowerCase().trim();
  if (SHUTTERSTOCK_CATEGORIES.some((c) => c.label.toLowerCase() === lower)) return true;
  // Normalised match: strip punctuation
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\/\-&,\s]+/g, "");
  const normId = normalize(id);
  return SHUTTERSTOCK_CATEGORIES.some((c) => normalize(c.id) === normId || normalize(c.label) === normId);
}
