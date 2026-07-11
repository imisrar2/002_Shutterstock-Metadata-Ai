import React, { useEffect, useRef, useState } from "react";
import type { ApiKeyRecord } from "@/types";
import {
  getAllKeys,
  addKeys,
  removeKey,
  removeAllKeys
} from "@/services/apiKeyRotation";
import { validateApiKey } from "@/services/geminiService";

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setKeys(await getAllKeys());

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async () => {
    const raw = input
      .split(/[\n,]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (raw.length === 0) return;
    await addKeys(raw, raw.length > 1 ? "Bulk import" : "Manual entry");
    setInput("");
    await refresh();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    await addKeys(lines, `Imported from ${file.name}`);
    await refresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleValidateAll = async () => {
    setValidating(true);
    for (const key of keys) {
      // eslint-disable-next-line no-await-in-loop
      await validateApiKey(key.key);
    }
    setValidating(false);
    await refresh();
  };

  return (
    <div>
      <div className="field-group">
        <label className="field-label">Add API key(s)</label>
        <textarea
          className="field-input"
          placeholder="Paste one or more Gemini API keys, one per line…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <span className="field-hint">Supports pasting multiple keys at once, one per line.</span>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleAdd} disabled={!input.trim()}>
          Add Key(s)
        </button>
        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
          Import .txt
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        style={{ display: "none" }}
        onChange={handleFileImport}
      />

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="field-label">Stored keys ({keys.length})</span>
          <button
            className="btn btn-ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
            onClick={async () => {
              await removeAllKeys();
              await refresh();
            }}
            disabled={keys.length === 0}
          >
            Delete All
          </button>
        </div>

        {keys.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No API keys added yet.</p>
        ) : (
          keys.map((k) => <KeyRow key={k.id} record={k} onRemoved={refresh} />)
        )}

        {keys.length > 0 && (
          <button
            className="btn btn-secondary btn-full"
            style={{ marginTop: 8 }}
            onClick={handleValidateAll}
            disabled={validating}
          >
            {validating ? "Validating…" : "Validate All Keys"}
          </button>
        )}
      </div>
    </div>
  );
}

function KeyRow({ record, onRemoved }: { record: ApiKeyRecord; onRemoved: () => void }) {
  const badge = record.disabled
    ? { cls: "badge-disabled", label: "Disabled" }
    : record.cooldownUntil && record.cooldownUntil > Date.now()
      ? { cls: "badge-cooldown", label: "Cooldown" }
      : { cls: "badge-ok", label: "Ready" };

  return (
    <div className="key-row">
      <span className="key-row-value">{maskKey(record.key)}</span>
      <span className={`key-row-badge ${badge.cls}`}>{badge.label}</span>
      <button
        className="small-btn"
        aria-label="Delete key"
        onClick={async () => {
          await removeKey(record.id);
          onRemoved();
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" />
    </svg>
  );
}
