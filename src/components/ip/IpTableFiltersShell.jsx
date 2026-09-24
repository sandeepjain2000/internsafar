'use client';

import { Filter, X } from 'lucide-react';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';

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

function toOptions(options) {
  return (Array.isArray(options) ? options : [])
    .filter((o) => o != null && String(o).trim() !== '')
    .map((o) => (typeof o === 'object' ? o : { value: String(o), label: String(o) }));
}

/**
 * Searchable multi-select for table column filters (replaces checkbox lists).
 */
export function IpSearchableMultiFilter({
  label,
  options,
  values,
  onChange,
  placeholder = 'Search & select…',
}) {
  const opts = toOptions(options);
  const selected = Array.isArray(values) ? values.map(String) : [];

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
      <SearchableMultiSelect
        options={opts}
        value={selected}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={label}
        emptyHint="No matching values"
      />
    </div>
  );
}

/**
 * Compact native multi-select for small finite sets (e.g. status).
 */
export function IpFiniteMultiFilter({ label, options, values, onChange }) {
  const opts = toOptions(options);
  const selected = Array.isArray(values) ? values.map(String) : [];

  if (!opts.length) {
    return (
      <div className="ip-tf__field">
        <span className="ip-tf__label">{label}</span>
        <span className="ip-tf__empty">No values yet</span>
      </div>
    );
  }

  if (opts.length > 8) {
    return (
      <IpSearchableMultiFilter
        label={label}
        options={opts}
        values={selected}
        onChange={onChange}
        placeholder={`Select ${String(label).toLowerCase()}…`}
      />
    );
  }

  return (
    <div className="ip-tf__field">
      <span className="ip-tf__label">{label}</span>
      <select
        className="ip-tf__select"
        multiple
        size={Math.min(opts.length, 5)}
        value={selected}
        aria-label={label}
        onChange={(e) => {
          const next = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(next);
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label || o.value}
          </option>
        ))}
      </select>
      <span className="ip-tf__hint">Hold Ctrl/Cmd to select multiple</span>
    </div>
  );
}

/** Alias — old checkbox list now uses searchable multi-select. */
export function IpMultiCheckFilter(props) {
  return <IpSearchableMultiFilter {...props} />;
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
