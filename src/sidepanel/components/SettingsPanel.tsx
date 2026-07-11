import React, { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { ApiKeyManager } from "./ApiKeyManager";


type Tab = "api" | "processing" | "workspace" | "export" | "general";

const TABS: { id: Tab; label: string }[] = [
  { id: "api", label: "API" },
  { id: "processing", label: "Processing" },
  { id: "workspace", label: "Workspace" },
  { id: "export", label: "Export" },
  { id: "general", label: "General" }
];



export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>("api");
  const { settings, updateSection } = useSettings();

  return (
    <div className="card">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "api" && <ApiKeyManager />}

      {tab === "processing" && (
        <>
          <div className="field-group">
            <label className="field-label">Fill mode</label>
            <div className="segmented">
              <button
                className={settings.processing.fillMode === "auto" ? "active" : ""}
                onClick={() => updateSection("processing", { fillMode: "auto" })}
              >
                Auto Fill
              </button>
              <button
                className={settings.processing.fillMode === "review" ? "active" : ""}
                onClick={() => updateSection("processing", { fillMode: "review" })}
              >
                Review Before Fill
              </button>
            </div>
            <span className="field-hint">
              Auto Fill populates description, keywords, and categories with no manual review.
            </span>
          </div>

          <div className="field-group">
            <label className="field-label">Max retries per item</label>
            <input
              className="field-input"
              type="number"
              min={1}
              max={10}
              value={settings.processing.maxRetries}
              onChange={(e) =>
                updateSection("processing", { maxRetries: clampInt(e.target.value, 1, 10) })
              }
            />
          </div>

          <div className="field-group">
            <label className="field-label">Keyword count range</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="field-input"
                type="number"
                min={5}
                max={settings.processing.maxKeywords}
                value={settings.processing.minKeywords}
                onChange={(e) =>
                  updateSection("processing", { minKeywords: clampInt(e.target.value, 5, 50) })
                }
              />
              <input
                className="field-input"
                type="number"
                min={settings.processing.minKeywords}
                max={50}
                value={settings.processing.maxKeywords}
                onChange={(e) =>
                  updateSection("processing", { maxKeywords: clampInt(e.target.value, 5, 50) })
                }
              />
            </div>
            <span className="field-hint">Shutterstock allows up to 50 keywords per asset.</span>
          </div>

          <div className="field-group">
            <label className="field-label">Request timeout (seconds)</label>
            <input
              className="field-input"
              type="number"
              min={10}
              max={90}
              value={settings.processing.requestTimeoutMs / 1000}
              onChange={(e) =>
                updateSection("processing", {
                  requestTimeoutMs: clampInt(e.target.value, 10, 90) * 1000
                })
              }
            />
          </div>
        </>
      )}

      {tab === "workspace" && (
        <>


          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Auto-open side panel</div>
              <div className="toggle-row-desc">Opens automatically when you visit the Shutterstock upload page.</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.workspace.autoOpenSidePanel}
                onChange={(e) => updateSection("workspace", { autoOpenSidePanel: e.target.checked })}
              />
              <span className="switch-track" />
            </label>
          </div>
        </>
      )}

      {tab === "export" && (
        <>
          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Include failed items</div>
              <div className="toggle-row-desc">Export rows that failed processing along with completed ones.</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.export.includeFailedItems}
                onChange={(e) => updateSection("export", { includeFailedItems: e.target.checked })}
              />
              <span className="switch-track" />
            </label>
          </div>

          <div className="field-group">
            <label className="field-label">CSV filename prefix</label>
            <input
              className="field-input"
              type="text"
              value={settings.export.filenamePrefix}
              onChange={(e) => updateSection("export", { filenamePrefix: e.target.value })}
            />
          </div>
        </>
      )}

      {tab === "general" && (
        <>
          <div className="field-group">
            <label className="field-label">Theme</label>
            <div className="segmented">
              <button
                className={settings.general.theme === "dark" ? "active" : ""}
                onClick={() => updateSection("general", { theme: "dark" })}
              >
                Dark
              </button>
              <button
                className={settings.general.theme === "light" ? "active" : ""}
                onClick={() => updateSection("general", { theme: "light" })}
              >
                Light
              </button>
              <button
                className={settings.general.theme === "system" ? "active" : ""}
                onClick={() => updateSection("general", { theme: "system" })}
              >
                System
              </button>
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Notify on completion</div>
              <div className="toggle-row-desc">Show a browser notification when the queue finishes.</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.general.notifyOnComplete}
                onChange={(e) => updateSection("general", { notifyOnComplete: e.target.checked })}
              />
              <span className="switch-track" />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

