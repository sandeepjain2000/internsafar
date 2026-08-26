'use client';

import { useEffect, useState } from 'react';

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

  // Keep selection if the preset list was refreshed with the same id
  useEffect(() => {
    if (!selectedId) return;
    const stillThere = (presets || []).some((p) => String(p.id) === String(selectedId));
    if (!stillThere) setSelectedId('');
  }, [presets, selectedId]);

  async function onSave(asDefault) {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const result = await savePreset(n, asDefault);
      const ok = result === true || result?.ok === true;
      const newId = result?.id != null ? String(result.id) : '';
      if (ok) {
        setName('');
        if (newId) setSelectedId(newId);
      }
    } finally {
      setBusy(false);
    }
  }

  function findPreset(id) {
    const key = String(id || '');
    if (!key) return null;
    return (presets || []).find((p) => String(p.id) === key) || null;
  }

  function onSelectPreset(id) {
    const key = String(id || '');
    setSelectedId(key);
    const p = findPreset(key);
    if (p) applyPreset(p);
  }

  const selected = findPreset(selectedId);

  if (!ready) {
    return (
      <div
        className="flex flex-wrap items-end gap-2 text-sm"
        aria-busy="true"
        aria-label="Loading saved views"
        style={{ minHeight: '3.25rem' }}
      >
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Saved views</span>
          <select className="h-9 rounded-md border px-2 min-w-[160px]" disabled value="">
            <option value="">Loading presets…</option>
          </select>
        </label>
        <button type="button" className="h-9 rounded-md border px-3 opacity-50" disabled>
          Apply
        </button>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Save current as</span>
          <input className="h-9 rounded-md border px-2 min-w-[140px]" disabled placeholder="Preset name" />
        </label>
        <button type="button" className="h-9 rounded-md border px-3 opacity-50" disabled>
          Save
        </button>
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm" style={{ minHeight: '3.25rem' }}>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Saved views</span>
        <select
          className="h-9 rounded-md border px-2 min-w-[160px]"
          value={selectedId}
          onChange={(e) => onSelectPreset(e.target.value)}
        >
          <option value="">Select a preset…</option>
          {(presets || []).map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}{p.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="h-9 rounded-md border px-3 disabled:opacity-50"
        disabled={!selectedId}
        onClick={() => {
          const p = findPreset(selectedId);
          if (p) applyPreset(p);
        }}
        title="Re-apply the selected preset"
      >
        Apply
      </button>
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
        disabled={busy || !name.trim() || (presets || []).length >= 5}
        onClick={() => onSave(false)}
      >
        Save
      </button>
      <button
        type="button"
        className="h-9 rounded-md border px-3 disabled:opacity-50"
        disabled={busy || !name.trim() || (presets || []).length >= 5}
        onClick={() => onSave(true)}
      >
        Save as default
      </button>
      {selected ? (
        <>
          <button type="button" className="h-9 rounded-md border px-3" onClick={() => toggleDefault(selected)}>
            {selected.is_default ? 'Unset default' : 'Make default'}
          </button>
          <button
            type="button"
            className="h-9 rounded-md border px-3"
            onClick={() => {
              deletePreset(selected);
              setSelectedId('');
            }}
          >
            Delete
          </button>
        </>
      ) : null}
      {presetError ? <span className="text-xs text-destructive">{presetError}</span> : null}
      <span className="text-xs text-muted-foreground">{(presets || []).length}/5 saved</span>
    </div>
  );
}
