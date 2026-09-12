'use client';

import { useEffect } from 'react';

const IGNORE = [
  /^ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Loading CSS chunk/i,
  /Loading chunk [\d]+ failed/i,
];

function report(message, meta = {}) {
  const text = String(message || '').trim();
  if (!text || IGNORE.some((re) => re.test(text))) return;
  void fetch('/api/ip/ops/report-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text.slice(0, 2000),
      kind: 'UNEXPECTED_CLIENT',
      source: meta.source || 'window',
      route: typeof window !== 'undefined' ? window.location?.pathname : null,
      href: typeof window !== 'undefined' ? window.location?.href : null,
      stack: meta.stack ? String(meta.stack).slice(0, 2500) : null,
    }),
  }).catch(() => {});
}

/** Catches uncaught window errors / rejections and emails ops (server debounces). */
export default function ClientOpsErrorGuard() {
  useEffect(() => {
    function onError(event) {
      report(event?.message || event?.error?.message || 'Window error', {
        source: 'window.onerror',
        stack: event?.error?.stack,
      });
    }
    function onRejection(event) {
      const reason = event?.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
      report(message, {
        source: 'unhandledrejection',
        stack: reason instanceof Error ? reason.stack : null,
      });
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

export function reportClientOpsError(message, meta = {}) {
  report(message, meta);
}
