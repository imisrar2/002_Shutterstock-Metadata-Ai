import { GEMINI_ENDPOINT, GEMINI_MODEL, RATE_LIMIT_COOLDOWN_MS, TRANSIENT_FAILURE_COOLDOWN_MS } from "@/constants/config";
import { SHUTTERSTOCK_CATEGORIES, isValidCategoryId } from "@/constants/categories";
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
    (c) => `- ${c.id}: ${c.label}`
  ).join("\n");

  return `You are a professional Shutterstock contributor metadata specialist analyzing a stock asset (photo, illustration, vector, or graphic) for licensing on Shutterstock.

Return ONLY a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "title": string,
  "description": string,
  "keywords": string[],
  "primaryCategory": string,
  "secondaryCategory": string | null,
  "primaryConfidence": number,
  "secondaryConfidence": number
}

Rules:
1. "title": a concise, descriptive, SEO-optimized title (max 200 characters). Should read like a professional stock asset title. Do NOT use generic phrases like "Beautiful image of..." — be specific about the subject.
2. "description": one natural, commercial, SEO-friendly sentence (max ~200 characters) that describes the asset. No keyword stuffing, no hallucinated details not visible in the image. If the asset is a vector or illustration, say so naturally. If it's a photo, describe it as a photo.
3. "keywords": between ${req.minKeywords} and ${req.maxKeywords} lowercase keywords, most relevant first, correctly spelled, no duplicates, no irrelevant terms, no trademarks, no company names, no celebrity names, no copyrighted character names, no spam/repetition.
4. "primaryCategory" and "secondaryCategory" MUST be chosen ONLY from this exact list of category ids (never invent a new one):
${categoryLines}
5. Only set "secondaryCategory" if you are genuinely confident it applies well beyond the primary category; otherwise set it to null.
6. "primaryConfidence" and "secondaryConfidence" are numbers between 0 and 1 representing your internal confidence — these are used internally only and will not be shown to any user.
7. Base everything strictly on what is visually present in the image. Do not guess brand names or real people.

File name for context only (do not copy verbatim into the title or description): "${req.fileName}"`;
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

  let primaryCategory =
    typeof obj.primaryCategory === "string" ? obj.primaryCategory : "";
  if (!isValidCategoryId(primaryCategory)) {
    primaryCategory = "miscellaneous";
  }

  let secondaryCategory =
    typeof obj.secondaryCategory === "string" ? obj.secondaryCategory : null;
  if (secondaryCategory && !isValidCategoryId(secondaryCategory)) {
    secondaryCategory = null;
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
