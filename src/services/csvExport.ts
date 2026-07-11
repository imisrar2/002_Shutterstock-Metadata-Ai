import type { QueueItem } from "@/types";
import { findCategoryById } from "@/constants/categories";

/**
 * Builds a Shutterstock-compatible metadata CSV.
 * Column order follows Shutterstock's contributor bulk-metadata template:
 * Filename, Description, Keywords, Categories, Editorial, Mature content, Illustration
 */
const HEADERS = [
  "Filename",
  "Description",
  "Keywords",
  "Categories",
  "Editorial",
  "Mature content",
  "Illustration"
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(
  items: QueueItem[],
  includeFailedItems: boolean
): string {
  const rows = items.filter((item) => {
    if (item.state === "filled") return true;
    return includeFailedItems && item.state === "failed";
  });

  const lines = [HEADERS.join(",")];

  for (const item of rows) {
    if (!item.metadata) continue;
    const primaryLabel = findCategoryById(item.metadata.primaryCategory)?.label ?? "";
    const secondaryLabel = findCategoryById(item.metadata.secondaryCategory)?.label ?? "";
    const categories = [primaryLabel, secondaryLabel].filter(Boolean).join(", ");

    const row = [
      csvEscape(item.fileName),
      csvEscape(item.metadata.description),
      csvEscape(item.metadata.keywords.join(", ")),
      csvEscape(categories),
      "no",
      "no",
      "yes"
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

export function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download(
    {
      url,
      filename,
      saveAs: true
    },
    () => {
      // Revoke shortly after the download is handed off to the browser.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  );
}
