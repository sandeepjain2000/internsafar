'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Coerce filters from API/DB (object or JSON string) into a plain object.
 */
export function normalizePrefsFilters(filters) {
  if (filters == null) return {};
  if (typeof filters === 'string') {
    try {
      const parsed = JSON.parse(filters);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof filters === 'object' && !Array.isArray(filters)) return filters;
  return {};
}

function normalizeSnapshot(s) {
  return {
    filters: normalizePrefsFilters(s?.filters),
    sort: s?.sort != null ? String(s.sort) : '',
  };
}

/**
 * Hydrate last-used filters/sort (and optional default preset) for a tableKey,
 * then debounce-persist changes. Default preset wins over last-used prefs.
 */
export function useListPrefsSync({ tableKey, snapshot, applySnapshot }) {
  const [ready, setReady] = useState(!tableKey);
  const [presets, setPresets] = useState([]);
  const [presetError, setPresetError] = useState('');
  const applyRef = useRef(applySnapshot);
  applyRef.current = applySnapshot;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const skipPersist = useRef(true);

  const loadPresets = useCallback(async () => {
    if (!tableKey) return [];
    const res = await fetch(`/api/ip/list-presets?tableKey=${encodeURIComponent(tableKey)}`);
    const data = await res.json().catch(() => ({}));
    const items = (data.items || []).map((p) => ({
      ...p,
      id: p.id != null ? String(p.id) : p.id,
      filters: normalizePrefsFilters(p.filters),
      sort: p.sort != null ? String(p.sort) : '',
    }));
    setPresets(items);
    return items;
  }, [tableKey]);

  useEffect(() => {
    if (!tableKey) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    skipPersist.current = true;
    setReady(false);
    (async () => {
      try {
        const [prefRes, items] = await Promise.all([
          fetch(`/api/ip/table-filter-prefs?tableKey=${encodeURIComponent(tableKey)}`)
            .then((r) => r.json())
            .catch(() => ({})),
          loadPresets(),
        ]);
        if (cancelled) return;
        const def = items.find((p) => p.is_default);
        const next = normalizeSnapshot({
          filters: def ? def.filters : prefRes.filters,
          sort: def ? (def.sort ?? '') : (prefRes.sort ?? ''),
        });
        applyRef.current(next);
      } finally {
        if (!cancelled) {
          skipPersist.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableKey, loadPresets]);

  useEffect(() => {
    if (!ready || !tableKey) return undefined;
    if (skipPersist.current) {
      skipPersist.current = false;
      return undefined;
    }
    const snap = snapshotRef.current || snapshot;
    const t = setTimeout(() => {
      fetch('/api/ip/table-filter-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableKey,
          filters: normalizePrefsFilters(snap?.filters),
          sort: snap?.sort ?? '',
        }),
      }).catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [ready, tableKey, snapshot]);

  async function savePreset(name, asDefault) {
    setPresetError('');
    const snap = snapshotRef.current || {};
    const filters = normalizePrefsFilters(snap.filters);
    const sort = snap.sort ?? '';
    const res = await fetch('/api/ip/list-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableKey,
        name,
        filters,
        sort,
        isDefault: Boolean(asDefault),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPresetError(data.error || 'Could not save preset');
      return { ok: false, id: '' };
    }
    const newId = data.id != null ? String(data.id) : '';
    // Show in dropdown immediately — no page refresh needed
    setPresets((prev) => {
      let next = Array.isArray(prev) ? [...prev] : [];
      if (asDefault) next = next.map((p) => ({ ...p, is_default: false }));
      const row = {
        id: newId,
        name,
        filters,
        sort,
        is_default: Boolean(asDefault),
        table_key: tableKey,
      };
      if (newId && !next.some((p) => String(p.id) === newId)) next.push(row);
      return next;
    });
    // Reconcile with server in background (don't block UI)
    loadPresets().catch(() => {});
    return { ok: true, id: newId };
  }

  async function applyPreset(preset) {
    if (!preset) return;
    skipPersist.current = false;
    applyRef.current(
      normalizeSnapshot({
        filters: normalizePrefsFilters(preset.filters),
        sort: preset.sort ?? '',
      }),
    );
  }

  async function toggleDefault(preset) {
    setPresetError('');
    const res = await fetch('/api/ip/list-presets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: preset.id, isDefault: !preset.is_default }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPresetError(data.error || 'Could not update default');
      return;
    }
    await loadPresets();
  }

  async function deletePreset(preset) {
    setPresetError('');
    const res = await fetch(`/api/ip/list-presets?id=${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPresetError(data.error || 'Could not delete preset');
      return;
    }
    setPresets((prev) => prev.filter((p) => String(p.id) !== String(preset.id)));
    await loadPresets();
  }

  return {
    ready,
    presets,
    presetError,
    savePreset,
    applyPreset,
    toggleDefault,
    deletePreset,
  };
}
