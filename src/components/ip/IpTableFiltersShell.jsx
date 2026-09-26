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
          aria-pressed={open}
          onClick={onToggle}
        >
          <Filter size={14} aria-hidden />
          Filters
          <span className={`ip-tf__state${open ? ' is-on' : ''}`}>{open ? 'Hide' : 'Show'}</span>
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
 * Single-value select for mutually exclusive / finite filter dimensions
 * (status, read/unread, category). Not multi-select.
 */
export function IpSingleSelectFilter({
  label,
  options,
  value,
  onChange,
  emptyLabel = 'Any',
}) {
  const opts = toOptions(options);
  const current = value == null ? '' : String(value);

  return (
    <div className="ip-tf__field">
      <span className="ip-tf__label">{label}</span>
      <select
        className="ip-tf__select ip-tf__select--single"
        value={current}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label || o.value}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Compact native multi-select for small finite sets where OR across values is valid
 * (e.g. several stipend labels). Prefer IpSingleSelectFilter when values are exclusive modes.
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
    <div className="ip-tf__field ip-tf__field--dates">
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

/** Relative received/sent windows (plus optional custom date range elsewhere). */
export const IP_RECEIVED_WINDOW_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function inReceivedWindow(value, window) {
  const w = String(window || '').trim();
  if (!w) return true;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  if (w === '1h') return ageMs <= 60 * 60 * 1000;
  if (w === '24h') return ageMs <= 24 * 60 * 60 * 1000;
  if (w === '7d') return ageMs <= 7 * 24 * 60 * 60 * 1000;
  if (w === '30d') return ageMs <= 30 * 24 * 60 * 60 * 1000;
  return true;
}
