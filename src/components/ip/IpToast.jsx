'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Long enough to read: 6s minimum, about 60ms per character, capped at 12s. */
export function toastDuration(message) {
  const n = typeof message === 'string' ? message.length : 0;
  return Math.min(12000, Math.max(6000, 4000 + n * 60));
}

/**
 * One visible toast: auto-dismisses after `toastDuration`, pauses while hovered or focused,
 * and has a Dismiss button. Not a live region itself — the caller provides one.
 */
export function IpToastItem({ message, onDismiss, className, children }) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  useEffect(() => {
    if (paused) return undefined;
    const t = window.setTimeout(() => onDismissRef.current?.(), toastDuration(message));
    return () => window.clearTimeout(t);
  }, [paused, message]);

  return (
    <div
      className={cn('ip-toast-body', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      {children ?? message}
      <button
        type="button"
        className="ip-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismissRef.current?.()}
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}

/**
 * Page-level toast. The screen-reader announcement comes from an always-present status region,
 * because a live region inserted together with its text is often not read out.
 *   <IpToast message={toast} onDismiss={() => setToast('')} className="ip-saq-toast" />
 */
export default function IpToast({ message, onDismiss, className, children }) {
  const text = typeof message === 'string' ? message : '';
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {text}
      </span>
      {message ? (
        <IpToastItem key={text || 'toast'} message={message} onDismiss={onDismiss} className={className}>
          {children}
        </IpToastItem>
      ) : null}
    </>
  );
}
