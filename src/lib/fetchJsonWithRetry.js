import { readResponseJson } from '@/lib/readResponseJson';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAYS_MS = [800, 2000];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Plain-language reason for a failed `fetchJsonWithRetry` result (by `kind`). */
export function fetchErrorMessage(kind) {
  if (kind === 'timeout') return 'The server took too long to respond.';
  if (kind === 'network') return 'We could not reach the server. Check your internet connection.';
  return 'Something went wrong on our side.';
}

/**
 * GET-style JSON fetch that never throws.
 * Network errors, 5xx and 429 are retried quietly; timeouts are not (a slow server
 * would only get slower). Result `kind`: 'auth' | 'http' | 'server' | 'network' | 'timeout'.
 */
export async function fetchJsonWithRetry(
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, ...init } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    let res = null;
    let data = {};
    let kind;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      data = await readResponseJson(res, {});
      if (res.ok) return { ok: true, status: res.status, data };
      if (res.status === 401) return { ok: false, status: 401, data, kind: 'auth' };
      if (res.status < 500 && res.status !== 429) return { ok: false, status: res.status, data, kind: 'http' };
      kind = 'server';
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return { ok: false, status: 0, data, kind: 'timeout' };
      }
      kind = 'network';
    }
    if (attempt >= retryDelaysMs.length) {
      return { ok: false, status: res?.status ?? 0, data, kind };
    }
    await wait(retryDelaysMs[attempt]);
  }
}
