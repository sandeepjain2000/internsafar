'use client';

import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import '@/components/ip/ip-list-status.css';

/** Intermediate loading state — never use the empty-list UI while this is showing. */
export function IpListLoading({ label = 'Please Wait…' }) {
  return (
    <div className="ip-list-status ip-list-status--loading" role="status" aria-live="polite">
      <Loader2 className="ip-list-status__spinner" size={28} aria-hidden />
      <p>{label}</p>
    </div>
  );
}

/** True empty state — only after loading finished and there are no rows. */
export function IpListEmpty({ title = 'No Entries Yet', hint = '', icon: Icon = null }) {
  return (
    <div className="ip-list-status ip-list-status--empty">
      {Icon ? <Icon className="ip-list-status__icon" size={28} aria-hidden /> : null}
      <h4>{title}</h4>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

/** Inline "Try again" for pages that already render their own error box. */
export function IpRetryButton({ onClick, label = 'Reload list' }) {
  return (
    <button type="button" className="ip-list-status__retry ip-list-status__retry--inline" onClick={onClick}>
      <RotateCw size={14} aria-hidden />
      {label}
    </button>
  );
}

/** Load failed — shown instead of the empty state so a server error never reads as "nothing here". */
export function IpListError({ message = '', onRetry = null, title = 'Could not load this list' }) {
  return (
    <div className="ip-list-status ip-list-status--error" role="alert" data-testid="ip-list-error">
      <AlertTriangle className="ip-list-status__icon ip-list-status__icon--error" size={28} aria-hidden />
      <h4>{title}</h4>
      <p>{message || 'Check your connection and try again.'}</p>
      {onRetry ? (
        <button type="button" className="ip-list-status__retry" onClick={onRetry}>
          <RotateCw size={14} aria-hidden />
          Try again
        </button>
      ) : null}
    </div>
  );
}
