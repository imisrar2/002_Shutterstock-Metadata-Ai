/**
 * Thin, typed wrapper around chrome.storage.local.
 * Everything the extension persists (queue, settings, API keys, session
 * flags) flows through here so storage access stays consistent and testable.
 */

export async function storageGet<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return key in result ? (result[key] as T) : null;
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function storageRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

export async function storageGetMultiple<T extends Record<string, unknown>>(
  keys: (keyof T & string)[]
): Promise<Partial<T>> {
  const result = await chrome.storage.local.get(keys);
  return result as Partial<T>;
}

/** Fires `callback` whenever the given key changes in chrome.storage.local. */
export function onStorageKeyChanged<T>(
  key: string,
  callback: (newValue: T | undefined, oldValue: T | undefined) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== "local") return;
    if (changes[key]) {
      callback(changes[key].newValue as T | undefined, changes[key].oldValue as T | undefined);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
