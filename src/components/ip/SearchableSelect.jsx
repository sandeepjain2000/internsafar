'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import '@/components/ip/ip-searchable-multi.css';

/**
 * Searchable single-select / typeahead. `value` is one option.value string (or '').
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Select',
  allowClear = true,
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = value == null ? '' : String(value);

  const optionsWithValue = useMemo(() => {
    const list = options || [];
    if (!selected) return list;
    const has = list.some((o) => String(o.value).toLowerCase() === selected.toLowerCase());
    if (has) return list;
    return [{ value: selected, label: selected }, ...list];
  }, [options, selected]);

  useEffect(() => {
    if (!open) setQ(selected);
  }, [selected, open]);

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
        setQ(selected);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [selected]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return optionsWithValue.filter((o) => {
      if (!needle) return true;
      return String(o.label || o.value).toLowerCase().includes(needle);
    });
  }, [optionsWithValue, q]);

  function pick(v) {
    onChange?.(v);
    setOpen(false);
    setQ(v || '');
  }

  function clear() {
    onChange?.('');
    setQ('');
    setOpen(false);
  }

  return (
    <div className="ip-sms ip-ss" ref={rootRef}>
      <div className="ip-ss-row">
        <input
          type="search"
          className="ip-sms-input"
          value={open ? q : selected}
          aria-label={ariaLabel}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        {allowClear && selected ? (
          <button type="button" className="ip-ss-clear" aria-label="Clear selection" onClick={clear}>
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="ip-sms-menu" role="listbox">
          {filtered.length ? filtered.map((o) => {
            const on = String(o.value).toLowerCase() === selected.toLowerCase();
            return (
              <li key={o.value}>
                <button
                  type="button"
                  className={on ? 'is-on' : undefined}
                  role="option"
                  aria-selected={on}
                  onClick={() => pick(o.value)}
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
