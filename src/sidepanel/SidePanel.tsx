import React, { useEffect, useState } from "react";
import type { RuntimeMessage } from "@/types";
import { useSettings } from "./hooks/useSettings";
import { NotOnShutterstock } from "./components/NotOnShutterstock";
import { Dashboard } from "./components/Dashboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { TopBar } from "./components/TopBar";

type View = "dashboard" | "settings";

export function SidePanel() {
  const { settings, loaded } = useSettings();
  const [onShutterstock, setOnShutterstock] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    if (loaded) {
      document.documentElement.setAttribute(
        "data-theme",
        settings.general.theme === "system" ? getSystemTheme() : settings.general.theme
      );
    }
  }, [loaded, settings.general.theme]);

  useEffect(() => {
    let cancelled = false;

    async function checkPage() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isShutterstock = !!tab?.url?.includes("submit.shutterstock.com");
      if (!cancelled) setOnShutterstock(isShutterstock);
    }

    checkPage();
    const listener = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (changeInfo.status === "complete" || changeInfo.url) checkPage();
    };
    const activatedListener = () => checkPage();

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onActivated.addListener(activatedListener);
    return () => {
      cancelled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onActivated.removeListener(activatedListener);
    };
  }, []);

  const handleGoToShutterstock = async () => {
    await chrome.runtime.sendMessage({ type: "OPEN_SHUTTERSTOCK" } satisfies RuntimeMessage);
  };

  return (
    <div className="app-shell">
      <TopBar view={view} onChangeView={setView} />
      <div className="panel-content">
        {view === "settings" ? (
          <SettingsPanel />
        ) : onShutterstock === false ? (
          <NotOnShutterstock onGoToShutterstock={handleGoToShutterstock} />
        ) : onShutterstock === true ? (
          <Dashboard />
        ) : (
          <div className="empty-state">
            <p>Checking current tab…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
