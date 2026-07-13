import { GEMINI_ENDPOINT, GEMINI_MODEL, RATE_LIMIT_COOLDOWN_MS, TRANSIENT_FAILURE_COOLDOWN_MS } from "@/constants/config";
import { SHUTTERSTOCK_CATEGORIES, findCategoryById } from "@/constants/categories";
import type { GeminiVisionRequest, GeminiVisionResponse, GeneratedMetadata } from "@/types";
import {
  selectBestAvailableKey,
  recordKeyFailure,
  recordKeySuccess
} from "./apiKeyRotation";
import { createLogger } from "@/utils/logger";
import { withRetry } from "@/utils/retry";

const log = createLogger("geminiService");

function buildPrompt(req: GeminiVisionRequest): string {
  const categoryLines = SHUTTERSTOCK_CATEGORIES.map(
    (c) => `- ${c.label}`
  ).join("\n");

  return `You are a professional Shutterstock contributor with extensive experience creating metadata for commercially successful vector illustrations.

Your objective is NOT to maximize keyword count.

Your objective is to generate metadata that Shutterstock is most likely to accept while accurately describing the artwork and maximizing discoverability.

Always prioritize:
1. Accuracy
2. Relevance
3. Commercial searchability
4. Shutterstock compatibility

Never optimize by adding irrelevant metadata.

========================================================
GENERAL RULES
========================================================
Generate metadata exactly as an experienced Shutterstock contributor would.
Everything must be supported by the uploaded vector.
Never invent:
- Objects, People, Animals, Brands, Logos, Companies, Products, Locations, Activities, Concepts not visually represented.
If something cannot be confirmed from the artwork, do not mention it.

========================================================
DESCRIPTION RULES
========================================================
Generate ONE professional English description.
The description must be:
• Natural, Human-written, Grammatically correct, Commercially useful, Concise, Accurate, Easy to read

The description should explain:
- Main subject, Important objects, Style, Purpose when visually obvious

Never include:
• Emoji, HTML, Markdown, Quotes, Brackets, Curly braces, Angle brackets, Pipe symbols, Slash abuse, Repeated punctuation, Multiple exclamation marks, Tabs, Newlines
Use only plain UTF-8 text.

Avoid characters that commonly create validation problems.
Do NOT use: # @ $ % ^ & * ~ \` | < > { } [] \\\\
Avoid unnecessary punctuation.
Use only: letters, numbers, spaces, comma, period, hyphen when absolutely necessary

Never include:
Copyright symbols, Trademark symbols, Registered symbols, Special Unicode decorations, Marketing language, Clickbait, AI-related wording

The description should stay within the configured character limits.

========================================================
KEYWORD STRATEGY
========================================================
Quality is MUCH more important than quantity.
Generate between \${req.minKeywords} and \${req.maxKeywords} keywords.
Never attempt to reach \${req.maxKeywords} keywords by adding weak terms.
Each keyword must contribute unique search value.

========================================================
KEYWORD ORDER
========================================================
Order keywords by importance.
1-5: Main subject
6-10: Main object
11-15: Major concept
16-20: Industry
21-25: Style
26-30: Usage
31-38: Supporting keywords only if highly relevant.

========================================================
KEYWORD TYPES
========================================================
Prefer: Single-word keywords, Common two-word search phrases (e.g. line art, flat design, mobile app, cyber security, data analysis, user interface)
Never generate long keyword phrases.

========================================================
REMOVE REDUNDANCY
========================================================
Never generate multiple keywords that represent nearly identical meaning.
Choose only the strongest commercially useful terms.
Avoid: Singular + plural duplicates, Spelling variations, Tiny wording differences, Repeated concepts

========================================================
NEVER GENERATE
========================================================
Brand names, Company names, Movie names, TV shows, Sports teams, Celebrities, Copyrighted characters, Trademarks, Adult content, Spam keywords, Trending unrelated words, Misleading keywords, Keywords not visible in the artwork, Duplicate keywords, Empty keywords

========================================================
STYLE KEYWORDS
========================================================
Include style only when visually obvious (e.g. outline, line icon, glyph, filled, minimal, flat, monochrome, gradient, isometric, hand drawn, geometric).

========================================================
COLOR KEYWORDS
========================================================
Only include colors if they are visually important. Do not list every visible color.

========================================================
USAGE KEYWORDS
========================================================
Only include usage terms that buyers commonly search (e.g. logo, icon, mobile app, website, dashboard, presentation, infographic, template, UI, UX).

========================================================
CATEGORY STRATEGY
========================================================
The extension provides Shutterstock's official category list.
Only choose from that list. Never invent categories. Never rename categories.
\${categoryLines}

========================================================
PRIMARY CATEGORY
========================================================
Choose the SINGLE BEST category. It must represent the artwork better than every other category. Never guess.

========================================================
SECONDARY CATEGORY
========================================================
Only choose a secondary category if it is strongly relevant.
If confidence is low, leave Secondary Category empty. Never force a second category.

========================================================
CATEGORY PRIORITY
========================================================
Always classify using the PRIMARY SUBJECT. Never classify using a minor object.
Example: A cybersecurity shield icon -> Primary: Technology (NOT Business).

========================================================
FINAL QUALITY CHECK
========================================================
Before returning metadata, verify:
✓ Description is natural, contains no forbidden symbols, contains no unnecessary punctuation, grammar is correct, no spelling mistakes.
✓ Keywords contain no duplicates, no repeated concepts, are commercially useful, ordered by importance.
✓ Only \${req.minKeywords}–\${req.maxKeywords} high-quality keywords.
✓ Category is the best possible Shutterstock category.
✓ Secondary category is empty unless strongly relevant.

File name for context only: "\${req.fileName}"

Return ONLY a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "title": string,
  "description": string,
  "keywords": string[],
  "primaryCategory": string,
  "secondaryCategory": string | null,
  "primaryConfidence": number,
  "secondaryConfidence": number
}`;
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}

function coerceMetadata(
  raw: unknown,
  req: GeminiVisionRequest
): GeneratedMetadata {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Gemini response was not a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const keywordsRaw = Array.isArray(obj.keywords) ? obj.keywords : [];
  const keywords = dedupeKeywords(
    keywordsRaw.filter((k): k is string => typeof k === "string")
  ).slice(0, req.maxKeywords);

  // Resolve primaryCategory: accept both slug and label text
  let primaryCategory =
    typeof obj.primaryCategory === "string" ? obj.primaryCategory.trim() : "";
  const resolvedPrimary = findCategoryById(primaryCategory);
  primaryCategory = resolvedPrimary ? resolvedPrimary.id : "miscellaneous";

  // Resolve secondaryCategory
  let secondaryCategory =
    typeof obj.secondaryCategory === "string" ? obj.secondaryCategory.trim() : null;
  if (secondaryCategory) {
    const resolvedSecondary = findCategoryById(secondaryCategory);
    secondaryCategory = resolvedSecondary ? resolvedSecondary.id : null;
  }
  if (secondaryCategory === primaryCategory) {
    secondaryCategory = null;
  }

  const primaryConfidence =
    typeof obj.primaryConfidence === "number" ? obj.primaryConfidence : 0.5;
  const secondaryConfidence =
    typeof obj.secondaryConfidence === "number" ? obj.secondaryConfidence : 0;

  // Only keep secondary category if confidence is high
  const finalSecondary = secondaryConfidence >= 0.6 ? secondaryCategory : null;

  // Use title as description fallback and vice versa
  const finalTitle = title || description;
  const finalDescription = description || title;

  if (!finalTitle || keywords.length < Math.min(5, req.minKeywords)) {
    throw new Error("Gemini response was missing required metadata fields.");
  }

  return {
    title: finalTitle,
    description: finalDescription,
    keywords,
    primaryCategory,
    secondaryCategory: finalSecondary,
    primaryConfidence,
    secondaryConfidence
  };
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }
  return result;
}

interface HttpError extends Error {
  status?: number;
}

async function callGemini(
  apiKey: string,
  req: GeminiVisionRequest,
  timeoutMs: number
): Promise<GeneratedMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(req) },
              {
                inline_data: {
                  mime_type: req.mimeType,
                  data: req.imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const err: HttpError = new Error(`Gemini request failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini response contained no text output.");
    }

    const parsed = extractJson(text);
    return coerceMetadata(parsed, req);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates metadata for a single asset image, handling API key selection,
 * rotation on failure, and retry with exponential backoff. Never throws for
 * expected failure modes — always returns a typed GeminiVisionResponse so
 * callers (the automation engine) can decide whether to retry the whole item.
 */
export async function generateMetadataForImage(
  req: GeminiVisionRequest,
  timeoutMs: number
): Promise<GeminiVisionResponse> {
  const key = await selectBestAvailableKey();
  if (!key) {
    return {
      ok: false,
      errorType: "invalid_key",
      message: "No available API keys. Add or re-enable a Gemini API key in Settings.",
      retryable: false
    };
  }

  try {
    const metadata = await withRetry(
      () => callGemini(key.key, req, timeoutMs),
      {
        maxAttempts: 2,
        baseDelayMs: 1500,
        isRetryable: (err) => {
          const status = (err as HttpError)?.status;
          return status === undefined || status >= 500;
        }
      }
    );
    await recordKeySuccess(key.id);
    return { ok: true, metadata };
  } catch (err) {
    const status = (err as HttpError)?.status;

    if (status === 429) {
      await recordKeyFailure(key.id, RATE_LIMIT_COOLDOWN_MS);
      return {
        ok: false,
        errorType: "rate_limit",
        message: "Rate limit reached for this key. Rotating to next available key.",
        retryable: true
      };
    }

    if (status === 400 || status === 401 || status === 403) {
      await recordKeyFailure(key.id, RATE_LIMIT_COOLDOWN_MS);
      return {
        ok: false,
        errorType: "invalid_key",
        message: `API key rejected (HTTP ${status}). Check that the key is valid.`,
        retryable: true
      };
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      await recordKeyFailure(key.id, TRANSIENT_FAILURE_COOLDOWN_MS);
      return {
        ok: false,
        errorType: "network",
        message: "Request timed out.",
        retryable: true
      };
    }

    if (err instanceof SyntaxError) {
      await recordKeyFailure(key.id, TRANSIENT_FAILURE_COOLDOWN_MS);
      return {
        ok: false,
        errorType: "parse",
        message: "Could not parse Gemini's response.",
        retryable: true
      };
    }

    await recordKeyFailure(key.id, TRANSIENT_FAILURE_COOLDOWN_MS);
    log.error("Unexpected Gemini error", err);
    return {
      ok: false,
      errorType: "unknown",
      message: err instanceof Error ? err.message : "Unknown error.",
      retryable: true
    };
  }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );
    return response.ok;
  } catch {
    return false;
  }
}
