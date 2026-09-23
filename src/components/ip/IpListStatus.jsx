'use client';

import { Loader2 } from 'lucide-react';
import '@/components/ip/ip-list-status.css';

/** Intermediate loading state — never use the empty-list UI while this is showing. */
export function IpListLoading({ label = 'Loading…' }) {
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
