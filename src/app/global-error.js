'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    void fetch('/api/ip/ops/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message || 'Critical application error').slice(0, 2000),
        kind: 'UNEXPECTED_CLIENT',
        source: 'next.global-error',
        stack: error?.stack ? String(error.stack).slice(0, 2500) : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>A critical error occurred. Please try again.</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}
