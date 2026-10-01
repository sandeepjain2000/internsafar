'use client';

import { useEffect } from 'react';

// Old tab asking for a code file from the build that a deploy just replaced.
const CHUNK_ERROR = /ChunkLoadError|Failed to load chunk|Loading (CSS )?chunk [\w-]+ failed/i;
const CHUNK_RELOAD_KEY = 'ip-chunk-reload-at';

export function isChunkLoadError(message, stack) {
  return CHUNK_ERROR.test(`${message || ''} ${stack || ''}`);
}

/** Reloads once per minute to pick up the new build; false if already tried (real failure). */
export function reloadForNewBuild() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

const IGNORE = [
  /^ResizeObserver loop/i,
  /^Script error\.?$/i,
  // CefSharp / Outlook Safe Links / embedded Chromium crawlers — not our app.
  /^Object Not Found Matching Id:\d+, MethodName:update, ParamCount:\d+$/i,
  // Empty/truncated bodies during deploy cutovers — clients should soft-fail; not ops-worthy.
  /Failed to execute ['"]json['"] on ['"]Response['"]/i,
  /Unexpected end of JSON input/i,
];

function report(message, meta = {}) {
  const text = String(message || '').trim();
  if (!text || IGNORE.some((re) => re.test(text))) return;
  if (isChunkLoadError(text, meta.stack) && reloadForNewBuild()) return;
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
