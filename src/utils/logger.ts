/**
 * Lightweight, namespaced logger. In production builds (import.meta.env.PROD)
 * debug-level logs are suppressed to keep the console clean; warnings and
 * errors always surface since they matter for diagnosing failed fills.
 */
type Level = "debug" | "info" | "warn" | "error";

function isProd(): boolean {
  try {
    // import.meta.env is injected by Vite; background/content bundles
    // (built with esbuild) won't have it, so guard defensively.
    // @ts-expect-error - env may not exist depending on bundler
    return Boolean(import.meta.env?.PROD);
  } catch {
    return false;
  }
}

function write(namespace: string, level: Level, args: unknown[]): void {
  if (level === "debug" && isProd()) return;
  const prefix = `[SSAI:${namespace}]`;
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](prefix, ...args);
}

export function createLogger(namespace: string) {
  return {
    debug: (...args: unknown[]) => write(namespace, "debug", args),
    info: (...args: unknown[]) => write(namespace, "info", args),
    warn: (...args: unknown[]) => write(namespace, "warn", args),
    error: (...args: unknown[]) => write(namespace, "error", args)
  };
}
