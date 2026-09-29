'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readResponseJson } from '@/lib/readResponseJson';

const HYDRATE_TIMEOUT_MS = 8000;

/**
 * Hydrate last-used filters/sort (and optional default preset) for a tableKey,
 * then debounce-persist changes. Default preset wins over last-used prefs.
 *
 * `serverView` (optional, stable promise): resolves to the saved view `{ filters, sort }`
 * already resolved by the page's list API, or null to fall back to fetching it here.
 */
export function useListPrefsSync({ tableKey, snapshot, applySnapshot, serverView }) {
  const [ready, setReady] = useState(!tableKey);
  const [presets, setPresets] = useState([]);
  const [presetError, setPresetError] = useState('');
  const applyRef = useRef(applySnapshot);
  applyRef.current = applySnapshot;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const skipPersist = useRef(true);

  const loadPresets = useCallback(async (init) => {
    if (!tableKey) return [];
    const res = await fetch(`/api/ip/list-presets?tableKey=${encodeURIComponent(tableKey)}`, init);
    const data = await readResponseJson(res, {});
    const raw = Array.isArray(data.items) ? data.items : [];
    const items = raw.map((p) => {
      let filters = p?.filters;
      if (typeof filters === 'string') {
        try {
          filters = JSON.parse(filters);
        } catch {
          filters = {};
        }
      }
      if (!filters || typeof filters !== 'object' || Array.isArray(filters)) filters = {};
      return { ...p, filters };
    });
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
      if (serverView) {
        const view = await serverView;
        if (cancelled) return;
        if (view) {
          loadPresets().catch(() => {});
          applyRef.current({ filters: view.filters || {}, sort: view.sort ?? '' }, { hydrate: true });
          skipPersist.current = true;
          setReady(true);
          return;
        }
      }
      const signal = AbortSignal.timeout(HYDRATE_TIMEOUT_MS);
      try {
        const [prefRes, items] = await Promise.all([
          fetch(`/api/ip/table-filter-prefs?tableKey=${encodeURIComponent(tableKey)}`, { signal })
            .then((r) => readResponseJson(r, {})),
          loadPresets({ signal }),
        ]);
        if (cancelled) return;
        const def = items.find((p) => p.is_default);
        applyRef.current({
          filters: (def ? def.filters : prefRes.filters) || {},
          sort: def ? (def.sort ?? '') : (prefRes.sort ?? ''),
        }, { hydrate: true });
      } catch {
        // Saved filters are optional: a slow or failed lookup must not block the list.
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
  }, [tableKey, loadPresets, serverView]);

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
    const data = await readResponseJson(res, {});
    if (!res.ok) {
      setPresetError(data.error || 'Could not save preset');
      return { ok: false, id: null };
    }
    const newId = data.id || data.item?.id || null;
    if (data.item?.id) {
      setPresets((prev) => {
        const without = (Array.isArray(prev) ? prev : []).filter((p) => p.id !== data.item.id);
        return [...without, data.item];
      });
    }
    await loadPresets();
    return { ok: true, id: newId };
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
    const data = await readResponseJson(res, {});
    if (!res.ok) {
      setPresetError(data.error || 'Could not update default');
      return;
    }
    await loadPresets();
  }

  async function deletePreset(preset) {
    setPresetError('');
    const res = await fetch(`/api/ip/list-presets?id=${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
    const data = await readResponseJson(res, {});
    if (!res.ok) {
      setPresetError(data.error || 'Could not delete preset');
      return { ok: false };
    }
    await loadPresets();
    return { ok: true };
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
