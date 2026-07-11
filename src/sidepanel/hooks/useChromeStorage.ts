import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet, onStorageKeyChanged } from "@/storage/storageService";

/**
 * Keeps a piece of React state in sync with a chrome.storage.local key,
 * both writing through on set and picking up changes made elsewhere
 * (e.g. the background service worker updating the queue snapshot).
 */
export function useChromeStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => Promise<void>, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storageGet<T>(key).then((stored) => {
      if (cancelled) return;
      setValue(stored ?? defaultValue);
      setLoaded(true);
    });

    const unsubscribe = onStorageKeyChanged<T>(key, (newValue) => {
      if (newValue !== undefined) setValue(newValue);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    async (next: T) => {
      setValue(next);
      await storageSet(key, next);
    },
    [key]
  );

  return [value, update, loaded];
}
