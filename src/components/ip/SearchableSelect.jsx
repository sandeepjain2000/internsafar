'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '@/components/ip/ip-searchable-multi.css';

/**
 * Searchable single-select / typeahead. `value` is one option.value string (or '').
 *
 * Clear affordances:
 * - Inner blue × (`.ip-ss-clear`) — our control, painted inside the field.
 * - Outer grey × — browser `::-ms-clear` / search-cancel; kept hidden via CSS + type="text".
 * Menu is portaled so Card overflow-hidden does not clip it.
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Select',
  loading = false,
  emptyHint = 'No options loaded yet.',
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = value == null ? '' : String(value);
  const showInnerClear = Boolean(selected) && !open;

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
      if (rootRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-ip-sms-menu]')) return;
      setOpen(false);
      setQ(selected);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [selected]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) {
      setMenuBox(null);
      return undefined;
    }
    function place() {
      const r = inputRef.current.getBoundingClientRect();
      setMenuBox({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 160),
      });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, q, options]);

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

  function clearSelection(e) {
    e.preventDefault();
    e.stopPropagation();
    onChange?.('');
    setQ('');
    setOpen(false);
  }

  const menu =
    open && menuBox && typeof document !== 'undefined'
      ? createPortal(
          <ul
            className="ip-sms-menu ip-sms-menu--portal"
            data-ip-sms-menu
            role="listbox"
            style={{
              position: 'fixed',
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              zIndex: 80,
            }}
          >
            {loading ? (
              <li className="ip-sms-none">Loading…</li>
            ) : !(options || []).length ? (
              <li className="ip-sms-none">{emptyHint}</li>
            ) : filtered.length ? (
              filtered.map((o) => {
                const on = String(o.value).toLowerCase() === selected.toLowerCase();
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      className={on ? 'is-on' : undefined}
                      role="option"
                      aria-selected={on}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o.value)}
                    >
                      {o.label || o.value}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="ip-sms-none">No matches</li>
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="ip-sms ip-ss" ref={rootRef}>
      <div className={`ip-ss-field${showInnerClear ? ' has-clear' : ''}`}>
        <input
          ref={inputRef}
          type="text"
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
            if (!e.target.value) onChange?.('');
          }}
        />
        {showInnerClear ? (
          <button
            type="button"
            className="ip-ss-clear"
            aria-label={`Clear ${ariaLabel}`}
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSelection}
          >
            <span aria-hidden>×</span>
          </button>
        ) : null}
      </div>
      {menu}
    </div>
  );
}
