'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '@/components/ip/ip-searchable-multi.css';

/**
 * Searchable multi-select / typeahead. `value` is an array of option.value strings.
 *
 * Clear affordances:
 * - Inner blue × on each chip — ours (keep).
 * - Outer grey × on the search input — browser native; hidden in CSS + type="text".
 * Menu is portaled + fixed so parent Card overflow-hidden does not clip it.
 */
export default function SearchableMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Select',
  loading = false,
  emptyHint = 'Loading cities…',
  allowCustom = false,
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-ip-sms-menu]')) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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
  }, [open, q, options, loading]);

  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const optionCount = (options || []).length;

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

  function addCustom() {
    const raw = q.trim();
    if (!raw || !allowCustom) return;
    toggle(raw);
    setQ('');
  }

  let menuBody;
  if (loading && !optionCount && !allowCustom) {
    menuBody = <li className="ip-sms-none">Loading cities…</li>;
  } else if (!optionCount && !allowCustom) {
    menuBody = <li className="ip-sms-none">{emptyHint}</li>;
  } else if (filtered.length) {
    menuBody = filtered.map((o) => {
      const on = selected.some((s) => String(s).toLowerCase() === String(o.value).toLowerCase());
      return (
        <li key={o.value}>
          <button
            type="button"
            className={on ? 'is-on' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggle(o.value)}
          >
            {o.label || o.value}
          </button>
        </li>
      );
    });
  } else if (allowCustom && q.trim()) {
    menuBody = (
      <li>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addCustom}>
          Add “{q.trim()}”
        </button>
      </li>
    );
  } else {
    menuBody = <li className="ip-sms-none">No matches</li>;
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
            {menuBody}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="ip-sms" ref={rootRef}>
      <div className="ip-sms-chips">
        {selected.length ? (
          selected.map((s) => (
            <button key={s} type="button" className="ip-sms-chip" onClick={() => toggle(s)}>
              {s} <span aria-hidden>×</span>
            </button>
          ))
        ) : (
          <span className="ip-sms-empty">None selected</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="text"
        className="ip-sms-input"
        value={q}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && allowCustom && q.trim()) {
            e.preventDefault();
            addCustom();
          }
        }}
      />
      {menu}
    </div>
  );
}
