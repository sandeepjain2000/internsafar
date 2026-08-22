'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import '@/components/ip/ip-searchable-multi.css';

/**
 * Searchable multi-select / typeahead. `value` is an array of option.value strings.
 */
export default function SearchableMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Select',
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (options || []).filter((o) => {
      if (!needle) return true;
      return String(o.label || o.value).toLowerCase().includes(needle);
    });
  }, [options, q]);

  function toggle(v) {
    const has = selected.some((s) => String(s).toLowerCase() === String(v).toLowerCase());
    const next = has
      ? selected.filter((s) => String(s).toLowerCase() !== String(v).toLowerCase())
      : [...selected, v];
    onChange?.(next);
  }

  return (
    <div className="ip-sms" ref={rootRef}>
      <div className="ip-sms-chips">
        {selected.length ? selected.map((s) => (
          <button key={s} type="button" className="ip-sms-chip" onClick={() => toggle(s)}>
            {s} ×
          </button>
        )) : <span className="ip-sms-empty">None selected</span>}
      </div>
      <input
        type="search"
        className="ip-sms-input"
        value={q}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <ul className="ip-sms-menu" role="listbox">
          {filtered.length ? filtered.map((o) => {
            const on = selected.some((s) => String(s).toLowerCase() === String(o.value).toLowerCase());
            return (
              <li key={o.value}>
                <button
                  type="button"
                  className={on ? 'is-on' : undefined}
                  onClick={() => toggle(o.value)}
                >
                  {o.label || o.value}
                </button>
              </li>
            );
          }) : <li className="ip-sms-none">No matches</li>}
        </ul>
      ) : null}
    </div>
  );
}
