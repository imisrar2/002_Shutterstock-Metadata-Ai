import { STORAGE_KEYS, MAX_CONSECUTIVE_FAILURES } from "@/constants/config";
import type { ApiKeyRecord } from "@/types";
import { storageGet, storageSet } from "@/storage/storageService";
import { createLogger } from "@/utils/logger";

const log = createLogger("apiKeyRotation");

function newId(): string {
  return `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAllKeys(): Promise<ApiKeyRecord[]> {
  return (await storageGet<ApiKeyRecord[]>(STORAGE_KEYS.API_KEYS)) ?? [];
}

async function saveAllKeys(keys: ApiKeyRecord[]): Promise<void> {
  await storageSet(STORAGE_KEYS.API_KEYS, keys);
}

export async function addKeys(
  rawKeys: string[],
  label = "Imported key"
): Promise<ApiKeyRecord[]> {
  const existing = await getAllKeys();
  const existingValues = new Set(existing.map((k) => k.key));
  const now = Date.now();

  const additions: ApiKeyRecord[] = rawKeys
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && !existingValues.has(k))
    .map((k) => ({
      id: newId(),
      key: k,
      label,
      addedAt: now,
      lastUsedAt: null,
      cooldownUntil: null,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalFailures: 0,
      disabled: false
    }));

  const updated = [...existing, ...additions];
  await saveAllKeys(updated);
  log.info(`Added ${additions.length} new key(s), ${updated.length} total.`);
  return updated;
}

export async function removeKey(id: string): Promise<ApiKeyRecord[]> {
  const updated = (await getAllKeys()).filter((k) => k.id !== id);
  await saveAllKeys(updated);
  return updated;
}

export async function removeAllKeys(): Promise<void> {
  await saveAllKeys([]);
}

export async function setKeyDisabled(
  id: string,
  disabled: boolean
): Promise<ApiKeyRecord[]> {
  const keys = await getAllKeys();
  const updated = keys.map((k) => (k.id === id ? { ...k, disabled } : k));
  await saveAllKeys(updated);
  return updated;
}

/**
 * Selects the best available key: not disabled, not in cooldown, and
 * preferring the key that was used longest ago (round-robin-ish) among keys
 * with the fewest recent failures. This avoids hammering a single key every
 * request while still respecting per-key rate limits and cooldowns.
 */
export async function selectBestAvailableKey(): Promise<ApiKeyRecord | null> {
  const keys = await getAllKeys();
  const now = Date.now();

  const available = keys.filter(
    (k) => !k.disabled && (!k.cooldownUntil || k.cooldownUntil <= now)
  );
  if (available.length === 0) return null;

  available.sort((a, b) => {
    if (a.consecutiveFailures !== b.consecutiveFailures) {
      return a.consecutiveFailures - b.consecutiveFailures;
    }
    const aLast = a.lastUsedAt ?? 0;
    const bLast = b.lastUsedAt ?? 0;
    return aLast - bLast;
  });

  return available[0];
}

export async function recordKeySuccess(id: string): Promise<void> {
  const keys = await getAllKeys();
  const updated = keys.map((k) =>
    k.id === id
      ? {
          ...k,
          lastUsedAt: Date.now(),
          totalRequests: k.totalRequests + 1,
          consecutiveFailures: 0,
          cooldownUntil: null
        }
      : k
  );
  await saveAllKeys(updated);
}

export async function recordKeyFailure(
  id: string,
  cooldownMs: number
): Promise<void> {
  const keys = await getAllKeys();
  const updated = keys.map((k) => {
    if (k.id !== id) return k;
    const consecutiveFailures = k.consecutiveFailures + 1;
    return {
      ...k,
      lastUsedAt: Date.now(),
      totalRequests: k.totalRequests + 1,
      totalFailures: k.totalFailures + 1,
      consecutiveFailures,
      cooldownUntil: Date.now() + cooldownMs,
      disabled: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    };
  });
  await saveAllKeys(updated);
  const key = updated.find((k) => k.id === id);
  if (key?.disabled) {
    log.warn(`Key ${key.label} auto-disabled after repeated failures.`);
  }
}

export async function hasAnyUsableKey(): Promise<boolean> {
  const keys = await getAllKeys();
  return keys.some((k) => !k.disabled);
}
