import type { CategoryOption } from "@/types";

/**
 * Shutterstock's official contributor category list.
 * Gemini is constrained to choose ONLY from this list — it must never invent
 * a category. IDs mirror Shutterstock's internal category slugs so they can
 * be mapped directly onto the category <select> elements on the upload page.
 */
export const SHUTTERSTOCK_CATEGORIES: CategoryOption[] = [
  { id: "abstract", label: "Abstract" },
  { id: "animals-wildlife", label: "Animals/Wildlife" },
  { id: "arts", label: "Arts" },
  { id: "backgrounds-textures", label: "Backgrounds/Textures" },
  { id: "beauty-fashion", label: "Beauty/Fashion" },
  { id: "buildings-landmarks", label: "Buildings/Landmarks" },
  { id: "business-finance", label: "Business/Finance" },
  { id: "celebrities", label: "Celebrities" },
  { id: "education", label: "Education" },
  { id: "food-drink", label: "Food and Drink" },
  { id: "healthcare-medical", label: "Healthcare/Medical" },
  { id: "holidays", label: "Holidays" },
  { id: "industrial", label: "Industrial" },
  { id: "interiors", label: "Interiors" },
  { id: "miscellaneous", label: "Miscellaneous" },
  { id: "nature", label: "Nature" },
  { id: "objects", label: "Objects" },
  { id: "parks-outdoor", label: "Parks/Outdoor" },
  { id: "people", label: "People" },
  { id: "religion", label: "Religion" },
  { id: "science", label: "Science" },
  { id: "signs-symbols", label: "Signs/Symbols" },
  { id: "sports-recreation", label: "Sports/Recreation" },
  { id: "technology", label: "Technology" },
  { id: "transportation", label: "Transportation" },
  { id: "vintage", label: "Vintage" }
];

export function findCategoryById(id: string | null): CategoryOption | null {
  if (!id) return null;
  return SHUTTERSTOCK_CATEGORIES.find((c) => c.id === id) ?? null;
}

export function isValidCategoryId(id: string): boolean {
  return SHUTTERSTOCK_CATEGORIES.some((c) => c.id === id);
}
