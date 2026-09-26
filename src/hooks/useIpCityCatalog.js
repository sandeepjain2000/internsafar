'use client';

import { useEffect, useMemo, useState } from 'react';
import { IP_REF_CITIES } from '@/lib/ipRefCitiesDegrees';
import { readResponseJson } from '@/lib/readResponseJson';

/** Instant client options so dropdowns never look empty while the API warms. */
function mapCityRows(rows) {
  return (rows || []).map((row) => {
    if (Array.isArray(row)) {
      const [city, state] = row;
      return {
        value: city,
        label: state && state !== 'Work mode' ? `${city} (${state})` : city,
        city,
        state,
      };
    }
    return row;
  });
}

const STATIC_CITY_OPTIONS = mapCityRows(IP_REF_CITIES);

let cachedCityItems = null;
let inflightCities = null;

async function loadCitiesOnce() {
  if (cachedCityItems?.length) return cachedCityItems;
  if (inflightCities) return inflightCities;
  inflightCities = fetch('/api/ip/ref/cities')
    .then(async (r) => {
      const d = await readResponseJson(r, {});
      if (!r.ok) throw new Error(d.error || `Cities HTTP ${r.status}`);
      const items = Array.isArray(d.items) ? d.items : [];
      // Never cache an empty success — cold/seed races used to stick the UI on “not loaded”.
      if (items.length) cachedCityItems = items;
      return items.length ? items : STATIC_CITY_OPTIONS;
    })
    .finally(() => {
      inflightCities = null;
    });
  return inflightCities;
}

/**
 * Loads /api/ip/ref/cities (shared in-tab cache) and derives unique state_ut options.
 * Bootstraps from the in-code city list so the first open is instant.
 */
export default function useIpCityCatalog() {
  const [cityOptions, setCityOptions] = useState(
    () => (cachedCityItems?.length ? cachedCityItems : STATIC_CITY_OPTIONS),
  );
  const [loading, setLoading] = useState(() => !cachedCityItems?.length);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    if (cachedCityItems?.length) {
      setCityOptions(cachedCityItems);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setLoadError('');
    loadCitiesOnce()
      .then((items) => {
        if (!alive) return;
        setCityOptions(items?.length ? items : STATIC_CITY_OPTIONS);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        // Keep static catalog usable; only surface error if we somehow have nothing.
        setCityOptions(STATIC_CITY_OPTIONS);
        setLoading(false);
        setLoadError(err?.message || 'Could not refresh cities from server');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function reload() {
    cachedCityItems = null;
    setLoading(true);
    setLoadError('');
    try {
      const items = await loadCitiesOnce();
      setCityOptions(items?.length ? items : STATIC_CITY_OPTIONS);
    } catch (err) {
      setCityOptions(STATIC_CITY_OPTIONS);
      setLoadError(err?.message || 'Could not refresh cities from server');
    } finally {
      setLoading(false);
    }
  }

  const stateOptions = useMemo(() => {
    const map = new Map();
    for (const o of cityOptions) {
      const s = String(o.state || '').trim();
      if (!s || /^work mode$/i.test(s)) continue;
      const key = s.toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return [...map.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((s) => ({ value: s, label: s }));
  }, [cityOptions]);

  /** Cities only (excludes Remote / work-mode rows). Optionally filter by state_ut. */
  const placeCityOptions = useMemo(() => {
    return cityOptions.filter((o) => !/^work mode$/i.test(String(o.state || '').trim()));
  }, [cityOptions]);

  function citiesForState(state, { includeWorkMode = false } = {}) {
    const base = includeWorkMode ? cityOptions : placeCityOptions;
    const needle = String(state || '').trim().toLowerCase();
    if (!needle) return base;
    return base.filter((o) => String(o.state || '').trim().toLowerCase() === needle);
  }

  function findCity(cityName) {
    const needle = String(cityName || '').trim().toLowerCase();
    if (!needle) return null;
    return cityOptions.find((o) => String(o.city || o.value).toLowerCase() === needle) || null;
  }

  return {
    cityOptions,
    placeCityOptions,
    stateOptions,
    citiesForState,
    findCity,
    loading,
    loadError,
    reload,
  };
}
