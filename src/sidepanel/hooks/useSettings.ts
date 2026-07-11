import { useCallback } from "react";
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "@/constants/config";
import type { AppSettings } from "@/types";
import { useChromeStorage } from "./useChromeStorage";

export function useSettings() {
  const [settings, setSettings, loaded] = useChromeStorage<AppSettings>(
    STORAGE_KEYS.SETTINGS,
    DEFAULT_SETTINGS
  );

  const updateSection = useCallback(
    async <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => {
      const next: AppSettings = {
        ...settings,
        [section]: { ...settings[section], ...patch }
      };
      await setSettings(next);
      chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: next }).catch(() => {});
    },
    [settings, setSettings]
  );

  return { settings, updateSection, loaded };
}
