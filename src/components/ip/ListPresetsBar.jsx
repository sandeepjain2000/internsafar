'use client';

import { useEffect, useState } from 'react';

/**
 * Compact preset controls — no stacked “Saved views / Save current as” labels
 * that squash above dense tables.
 *
 * `selectionResetKey` — bump from parent (e.g. Reset All Filters) to clear the
 * Preset… dropdown so the same preset can be re-selected.
 */
export default function ListPresetsBar({
  ready,
  presets,
  presetError,
  savePreset,
  applyPreset,
  toggleDefault,
  deletePreset,
  selectionResetKey = 0,
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setSelectedId('');
  }, [selectionResetKey]);

  useEffect(() => {
    if (!feedback) return undefined;
    const t = window.setTimeout(() => setFeedback(''), 2500);
    return () => window.clearTimeout(t);
  }, [feedback]);

  if (!ready) return null;

  async function onSave(asDefault) {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const result = await savePreset(n, asDefault);
    setBusy(false);
    const ok = result === true || result?.ok === true;
    const newId = result?.id || null;
    if (ok) {
      setName('');
      if (newId) setSelectedId(newId);
      setFeedback(asDefault ? 'Preset saved as default.' : 'Preset saved.');
    }
  }

  async function onDelete() {
    if (!selected) return;
    setBusy(true);
    const result = await deletePreset(selected);
    setBusy(false);
    if (result?.ok) {
      setSelectedId('');
      setFeedback('Preset deleted.');
    }
  }

  const selected = presets.find((p) => p.id === selectedId);

  return (
    <div className="ip-presets-bar flex flex-wrap items-center gap-2 text-sm">
      <select
        className="h-9 rounded-md border border-slate-200 bg-white px-2 min-w-[9rem] text-xs font-semibold text-slate-700"
        value={selectedId}
        aria-label="Load preset"
        onChange={(e) => {
          const id = e.target.value;
          setSelectedId(id);
          const p = presets.find((x) => x.id === id);
          if (p) applyPreset(p);
        }}
      >
        <option value="">Preset…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.is_default ? ' ★' : ''}
          </option>
        ))}
      </select>
      <input
        className="h-9 rounded-md border border-slate-200 bg-white px-2 min-w-[8rem] flex-1 text-xs text-slate-700"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New preset name"
        aria-label="New preset name"
        maxLength={80}
      />
      <button
        type="button"
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-50"
        disabled={busy || !name.trim() || presets.length >= 5}
        onClick={() => onSave(false)}
      >
        Save
      </button>
      <button
        type="button"
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-50"
        disabled={busy || !name.trim() || presets.length >= 5}
        onClick={() => onSave(true)}
        title="Save and make default"
      >
        Save default
      </button>
      {selected ? (
        <>
          <button
            type="button"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"
            disabled={busy}
            onClick={() => toggleDefault(selected)}
          >
            {selected.is_default ? 'Unset default' : 'Make default'}
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50 active:scale-[0.98]"
            disabled={busy}
            onClick={onDelete}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </>
      ) : null}
      {presets.length === 0 ? (
        <span className="text-[11px] font-medium text-slate-500">
          Save filters as a preset to reuse them later.
        </span>
      ) : null}
      {feedback ? (
        <span className="text-xs font-semibold text-emerald-700" role="status">
          {feedback}
        </span>
      ) : null}
      {presetError ? (
        <span className="w-full text-xs font-semibold text-red-600" role="alert">
          {presetError}
        </span>
      ) : null}
      <span className="text-[11px] font-semibold text-slate-400">{presets.length}/5</span>
    </div>
  );
}
