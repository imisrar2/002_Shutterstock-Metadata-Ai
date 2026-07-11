/**
 * Generic exponential backoff helper used by the Gemini service and the
 * queue processor so retry behavior stays consistent everywhere.
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
  isRetryable?: (error: unknown) => boolean;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30_000
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  // Full jitter to avoid synchronized retries across parallel calls.
  return Math.floor(Math.random() * exp);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    onRetry,
    isRetryable = () => true
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err;
      }
      onRetry?.(attempt, err);
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastError;
}
