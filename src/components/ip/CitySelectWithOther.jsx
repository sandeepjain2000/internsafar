'use client';

import { useEffect, useState } from 'react';
import SearchableSelect from '@/components/ip/SearchableSelect';

export const OTHER_CITY = 'Other (not listed)';

/**
 * Single city picker over the city catalog plus an "Other" choice that reveals a
 * free-text box — the catalog is not exhaustive. Stored value is always the city text.
 */
export default function CitySelectWithOther({
  options = [],
  value = '',
  isKnownCity,
  loading = false,
  onPick,
  onCustom,
  inputClassName = '',
  placeholder = 'Search cities…',
  ariaLabel = 'City',
  emptyHint,
}) {
  const raw = String(value || '');
  const city = raw.trim();
  const unknown = Boolean(city) && !loading && !isKnownCity?.(city);
  const [otherMode, setOtherMode] = useState(unknown);

  useEffect(() => {
    if (unknown) setOtherMode(true);
  }, [unknown]);

  const showOther = otherMode || unknown;

  return (
    <>
      <SearchableSelect
        options={[...options, { value: OTHER_CITY, label: OTHER_CITY, pinned: true }]}
        value={showOther ? OTHER_CITY : city}
        loading={loading && !options.length}
        emptyHint={emptyHint}
        onChange={(pick) => {
          if (pick === OTHER_CITY) {
            if (!showOther) onCustom?.('');
            setOtherMode(true);
            return;
          }
          setOtherMode(false);
          onPick?.(pick || '');
        }}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
      {showOther ? (
        <input
          className={inputClassName}
          style={{ marginTop: '0.5rem' }}
          value={raw}
          onChange={(e) => onCustom?.(e.target.value)}
          placeholder="Type your city"
          aria-label={`${ariaLabel} (not listed)`}
        />
      ) : null}
    </>
  );
}
