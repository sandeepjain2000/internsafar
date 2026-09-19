'use client';

import { useEffect, useState } from 'react';
import { IP_COUNTRY_SELECT_OPTIONS } from '@/lib/ipRegions';

let cachedCountryItems = null;
let inflightCountries = null;

async function loadCountriesOnce() {
  if (cachedCountryItems?.length) return cachedCountryItems;
  if (inflightCountries) return inflightCountries;
  inflightCountries = fetch('/api/ip/ref/countries')
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Countries HTTP ${r.status}`);
      const items = Array.isArray(d.items) ? d.items : [];
      if (items.length) cachedCountryItems = items;
      return items.length ? items : IP_COUNTRY_SELECT_OPTIONS;
    })
    .finally(() => {
      inflightCountries = null;
    });
  return inflightCountries;
}

/**
 * Loads /api/ip/ref/countries (DB catalog) with static fallback so dropdowns never look empty.
 */
export default function useIpCountryCatalog() {
  const [countryOptions, setCountryOptions] = useState(
    () => (cachedCountryItems?.length ? cachedCountryItems : IP_COUNTRY_SELECT_OPTIONS),
  );
  const [loading, setLoading] = useState(() => !cachedCountryItems?.length);

  useEffect(() => {
    let alive = true;
    if (cachedCountryItems?.length) {
      setCountryOptions(cachedCountryItems);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    loadCountriesOnce()
      .then((items) => {
        if (!alive) return;
        setCountryOptions(items?.length ? items : IP_COUNTRY_SELECT_OPTIONS);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCountryOptions(IP_COUNTRY_SELECT_OPTIONS);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { countryOptions, loading };
}
