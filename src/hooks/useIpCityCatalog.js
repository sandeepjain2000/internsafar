'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Loads /api/ip/ref/cities and derives unique state_ut options.
 */
export default function useIpCityCatalog() {
  const [cityOptions, setCityOptions] = useState([]);

  useEffect(() => {
    fetch('/api/ip/ref/cities')
      .then((r) => r.json())
      .then((d) => setCityOptions(d.items || []))
      .catch(() => {});
  }, []);

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

  return { cityOptions, placeCityOptions, stateOptions, citiesForState, findCity };
}
