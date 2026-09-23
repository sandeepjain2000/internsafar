'use client';

import { useMemo } from 'react';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import SearchableSelect from '@/components/ip/SearchableSelect';
import useIpCityCatalog from '@/hooks/useIpCityCatalog';

/**
 * Posting work locations: separate State + City controls (tracker P2).
 * State filters which cities appear; selected cities stay selected when the
 * filter changes so a posting can span multiple states. Stored values remain
 * city names in `locations` JSONB (unchanged API).
 */
export default function PostingLocationsFields({
  locationCities = [],
  locationState = '',
  onCitiesChange,
  onStateChange,
}) {
  const {
    placeCityOptions,
    stateOptions,
    findCity,
    loading: citiesLoading,
    loadError: citiesLoadError,
  } = useIpCityCatalog();

  const cities = Array.isArray(locationCities) ? locationCities : [];
  const stateNeedle = String(locationState || '').trim().toLowerCase();

  const cityChoices = useMemo(() => {
    const filtered = !stateNeedle
      ? placeCityOptions
      : placeCityOptions.filter(
          (o) => String(o.state || '').trim().toLowerCase() === stateNeedle,
        );
    // City-only labels (state is its own field). Keep selected cities visible as options.
    const byValue = new Map();
    for (const o of filtered) {
      const v = String(o.city || o.value || '').trim();
      if (!v) continue;
      byValue.set(v.toLowerCase(), { value: v, label: v, city: v, state: o.state });
    }
    for (const c of cities) {
      const v = String(c || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (byValue.has(key)) continue;
      const hit = findCity(v);
      byValue.set(key, {
        value: v,
        label: hit?.state ? `${v} (${hit.state})` : v,
        city: v,
        state: hit?.state || '',
      });
    }
    return [...byValue.values()];
  }, [placeCityOptions, stateNeedle, cities, findCity]);

  return (
    <>
      <Field className="overflow-visible">
        <FieldLabel>State</FieldLabel>
        <SearchableSelect
          options={stateOptions}
          value={locationState || ''}
          loading={citiesLoading && !(stateOptions || []).length}
          emptyHint={citiesLoadError || 'No states available'}
          onChange={(state) => onStateChange?.(state || '')}
          placeholder="Search states…"
          ariaLabel="Work state"
        />
        <FieldDescription>Pick a state to narrow the city list. Clear to browse all cities.</FieldDescription>
      </Field>
      <Field className="overflow-visible">
        <FieldLabel>City</FieldLabel>
        <SearchableMultiSelect
          options={cityChoices}
          value={cities}
          loading={citiesLoading && !(cityChoices || []).length}
          emptyHint={
            stateNeedle && !(cityChoices || []).length
              ? 'No cities for this state'
              : citiesLoadError || 'No cities available'
          }
          onChange={(next) => onCitiesChange?.(next)}
          placeholder={stateNeedle ? 'Search cities in this state…' : 'Search cities…'}
          ariaLabel="Work cities"
        />
        <FieldDescription>Select one or more work cities. You can change State to add cities from another state.</FieldDescription>
      </Field>
    </>
  );
}
