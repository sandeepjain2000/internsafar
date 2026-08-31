'use client';

import { useState } from 'react';

export default function ListPresetsBar({
  ready,
  presets,
  presetError,
  savePreset,
  applyPreset,
  toggleDefault,
  deletePreset,
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  if (!ready) return null;

  async function onSave(asDefault) {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const ok = await savePreset(n, asDefault);
    setBusy(false);
    if (ok) setName('');
  }

  const selected = presets.find((p) => p.id === selectedId);

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Saved views</span>
        <select
          className="h-9 rounded-md border px-2 min-w-[160px]"
          value={selectedId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedId(id);
            const p = presets.find((x) => x.id === id);
            if (p) applyPreset(p);
          }}
        >
          <option value="">Select a preset…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Save current as</span>
        <input
          className="h-9 rounded-md border px-2 min-w-[140px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset name"
          maxLength={80}
        />
      </label>
      <button
        type="button"
        className="h-9 rounded-md border px-3 disabled:opacity-50"
        disabled={busy || !name.trim() || presets.length >= 5}
        onClick={() => onSave(false)}
      >
        Save
      </button>
      <button
        type="button"
        className="h-9 rounded-md border px-3 disabled:opacity-50"
        disabled={busy || !name.trim() || presets.length >= 5}
        onClick={() => onSave(true)}
      >
        Save as default
      </button>
      {selected ? (
        <>
          <button type="button" className="h-9 rounded-md border px-3" onClick={() => toggleDefault(selected)}>
            {selected.is_default ? 'Unset default' : 'Make default'}
          </button>
          <button type="button" className="h-9 rounded-md border px-3" onClick={() => deletePreset(selected)}>
            Delete
          </button>
        </>
      ) : null}
      {presetError ? <span className="text-xs text-destructive">{presetError}</span> : null}
      <span className="text-xs text-muted-foreground">{presets.length}/5 saved</span>
    </div>
  );
}
