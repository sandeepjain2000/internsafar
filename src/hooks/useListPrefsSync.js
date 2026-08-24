'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
    const items = data.items || [];
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
        applyRef.current({
          filters: (def ? def.filters : prefRes.filters) || {},
          sort: def ? (def.sort ?? '') : (prefRes.sort ?? ''),
        });
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
    const t = setTimeout(() => {
      fetch('/api/ip/table-filter-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableKey,
          filters: snapshot.filters || {},
          sort: snapshot.sort ?? '',
        }),
      }).catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [ready, tableKey, snapshot]);

  async function savePreset(name, asDefault) {
    setPresetError('');
    const res = await fetch('/api/ip/list-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableKey,
        name,
        filters: snapshotRef.current.filters || {},
        sort: snapshotRef.current.sort ?? '',
        isDefault: Boolean(asDefault),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPresetError(data.error || 'Could not save preset');
      return false;
    }
    await loadPresets();
    return true;
  }

  async function applyPreset(preset) {
    if (!preset) return;
    skipPersist.current = false;
    applyRef.current({
      filters: preset.filters || {},
      sort: preset.sort ?? '',
    });
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
