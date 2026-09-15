'use client';

import { Filter, X } from 'lucide-react';

/**
 * Toolbar Filters button + expandable panel above a table (does not cover rows).
 */
export function IpTableFiltersShell({
  open,
  onToggle,
  activeCount = 0,
  onClear,
  children,
  className = '',
}) {
  return (
    <div className={`ip-tf ${className}`.trim()}>
      <div className="ip-tf__bar">
        <button
          type="button"
          className={`ip-tf__btn${open || activeCount ? ' is-on' : ''}`}
          aria-expanded={open}
          onClick={onToggle}
        >
          <Filter size={14} aria-hidden />
          Filters
          {activeCount > 0 ? <span className="ip-tf__chip">{activeCount}</span> : null}
        </button>
        {activeCount > 0 ? (
          <button type="button" className="ip-tf__clear" onClick={onClear}>
            <X size={12} aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
      {open ? <div className="ip-tf__panel">{children}</div> : null}
    </div>
  );
}

/** Multi-select checklist for discrete column values. */
export function IpMultiCheckFilter({ label, options, values, onChange }) {
  const selected = Array.isArray(values) ? values : [];
  const opts = Array.isArray(options) ? options.filter(Boolean) : [];

  function toggle(opt) {
    const v = String(opt);
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  if (!opts.length) {
    return (
      <div className="ip-tf__field">
        <span className="ip-tf__label">{label}</span>
        <span className="ip-tf__empty">No values yet</span>
      </div>
    );
  }

  return (
    <div className="ip-tf__field">
      <span className="ip-tf__label">{label}</span>
      <div className="ip-tf__checks" role="group" aria-label={label}>
        {opts.map((opt) => {
          const v = String(opt);
          const id = `ip-tf-${label}-${v}`.replace(/\s+/g, '-');
          return (
            <label key={v} htmlFor={id} className="ip-tf__check">
              <input
                id={id}
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() => toggle(v)}
              />
              <span>{v}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function IpDateRangeFilter({ label, from, to, onFrom, onTo }) {
  return (
    <div className="ip-tf__field">
      <span className="ip-tf__label">{label}</span>
      <div className="ip-tf__dates">
        <input
          type="date"
          value={from || ''}
          onChange={(e) => onFrom(e.target.value)}
          aria-label={`${label} from`}
        />
        <span className="ip-tf__dates-sep">to</span>
        <input
          type="date"
          value={to || ''}
          onChange={(e) => onTo(e.target.value)}
          aria-label={`${label} to`}
        />
      </div>
    </div>
  );
}
