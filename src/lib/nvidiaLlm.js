import fs from 'fs';
import path from 'path';

/**
 * NVIDIA NIM chat helper — adapted from the working pattern used by b.py
 * (nvidia_chat + discover_nvidia_key_files + key rotation).
 *
 * HTTP: OpenAI-compatible Chat Completions on integrate.api.nvidia.com
 * Keys: local nvidia_keys/key-*.json { api_key } and/or env NVIDIA_API_KEY
 *
 * Rate limit: placementhubsupport NVIDIA keys are ~40 rpm. This module
 * throttles outbound NIM calls (best-effort per Node process / serverless instance).
 */

export const NVIDIA_MODEL =
  process.env.NVIDIA_MODEL || 'mistralai/mistral-nemotron';

const NVIDIA_BASE_URL = (
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
).replace(/\/$/, '');

const REQUEST_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS) || 35_000;

/** placementhubsupport quota ≈ 40 requests/minute */
const RPM_LIMIT = Math.max(1, Number(process.env.NVIDIA_RPM_LIMIT) || 40);
const RPM_WINDOW_MS = 60_000;
/** Floor spacing so a burst cannot dump 40 calls in one second */
const MIN_GAP_MS = Math.max(
  250,
  Number(process.env.NVIDIA_MIN_GAP_MS) || Math.ceil(RPM_WINDOW_MS / RPM_LIMIT),
);

function keysDirCandidates() {
  return [
    path.join(process.cwd(), 'nvidia_keys'),
    path.join(process.cwd(), 'nvidia keys'),
  ];
}

/** Discover local key JSON files (filename only is safe to log). */
export function discoverNvidiaKeyFiles() {
  for (const dir of keysDirCandidates()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((n) => /^key-\d+\.json$/i.test(n))
      .sort()
      .map((n) => path.join(dir, n));
    if (files.length) return files;
  }
  return [];
}

function readKeyFromFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const apiKey = String(raw?.api_key || raw?.apiKey || '').trim();
    if (!apiKey) return null;
    return { apiKey, keyId: path.basename(filePath) };
  } catch {
    return null;
  }
}

/**
 * Ordered credential pool: env first (Vercel), then local key files.
 * On Vercel, skip filesystem keys so CLI deploys never depend on uploaded key files.
 * Never log apiKey values.
 */
export function loadNvidiaCredentials() {
  const pool = [];
  const envKey = String(process.env.NVIDIA_API_KEY || '').trim();
  if (envKey) pool.push({ apiKey: envKey, keyId: 'env:NVIDIA_API_KEY' });

  const multi = String(process.env.NVIDIA_API_KEYS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  multi.forEach((apiKey, i) => {
    pool.push({ apiKey, keyId: `env:NVIDIA_API_KEYS[${i}]` });
  });

  const onVercel = Boolean(process.env.VERCEL);
  if (!onVercel) {
    for (const file of discoverNvidiaKeyFiles()) {
      const entry = readKeyFromFile(file);
      if (entry) pool.push(entry);
    }
  }

  const seen = new Set();
  const unique = [];
  for (const item of pool) {
    if (seen.has(item.apiKey)) continue;
    seen.add(item.apiKey);
    unique.push(item);
  }
  return unique;
}

let rotationIndex = 0;

/** Sliding-window timestamps of outbound NIM calls (this process only). */
const recentCallAt = [];
let lastCallAt = 0;
let throttleChain = Promise.resolve();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait until we are under RPM_LIMIT in the last minute and MIN_GAP_MS since last call.
 * Serialized so concurrent help-chat requests do not stampede.
 */
async function awaitRateSlot(logFn) {
  const run = async () => {
    for (;;) {
      const now = Date.now();
      while (recentCallAt.length && now - recentCallAt[0] >= RPM_WINDOW_MS) {
        recentCallAt.shift();
      }
      const gapWait = Math.max(0, MIN_GAP_MS - (now - lastCallAt));
      let windowWait = 0;
      if (recentCallAt.length >= RPM_LIMIT) {
        windowWait = Math.max(0, RPM_WINDOW_MS - (now - recentCallAt[0]) + 25);
      }
      const waitMs = Math.max(gapWait, windowWait);
      if (waitMs <= 0) {
        const t = Date.now();
        recentCallAt.push(t);
        lastCallAt = t;
        return;
      }
      if (typeof logFn === 'function') {
        logFn(
          `NVIDIA NIM throttle wait ${waitMs}ms (rpmLimit=${RPM_LIMIT}, recent=${recentCallAt.length})`,
        );
      }
      await sleep(Math.min(waitMs, 15_000));
    }
  };

  const next = throttleChain.then(run, run);
  throttleChain = next.catch(() => {});
  await next;
}

function parseRetryAfterMs(res) {
  const raw = res.headers?.get?.('retry-after');
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.min(60_000, asNum * 1000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.min(60_000, Math.max(0, when - Date.now()));
  return null;
}

/** Longer backoff for 429 (rate limit). */
function rateLimitBackoffMs(retryIndex, retryAfterMs) {
  if (retryAfterMs != null) return Math.max(retryAfterMs, 1500);
  // ~2s, 5s, 12s
  return Math.min(30_000, Math.round(2000 * 2.5 ** retryIndex));
}

async function chatOnce({ apiKey, messages, maxTokens, temperature, logFn }) {
  await awaitRateSlot(logFn);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        temperature: temperature ?? 0.4,
        max_tokens: maxTokens ?? 600,
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(
      `NVIDIA NIM HTTP ${res.status}${data?.error?.message ? `: ${data.error.message}` : ''}`,
    );
    err.status = res.status;
    if (res.status === 429) {
      err.retryAfterMs = parseRetryAfterMs(res);
    }
    throw err;
  }

  const content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    '';
  if (!String(content).trim()) {
    throw new Error('NVIDIA NIM returned an empty response');
  }
  return String(content).trim();
}

/**
 * @returns {Promise<{ text: string, keyId: string }>}
 */
export async function nvidiaChat(userPrompt, systemPrompt = null, options = {}) {
  const {
    maxTokens = 220,
    temperature = 0.4,
    logFn = null,
    maxKeyAttempts = 3,
    retriesPerKey = 2,
  } = options;

  const pool = loadNvidiaCredentials();
  if (!pool.length) {
    throw new Error(
      'No NVIDIA credentials configured. Set NVIDIA_API_KEY (Vercel/env) or add nvidia_keys/key-*.json locally.',
    );
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: String(userPrompt || '') });

  const start = rotationIndex % pool.length;
  let lastError = null;
  const maxAttempts = Math.min(pool.length, Number(maxKeyAttempts) || 3);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const idx = (start + attempt) % pool.length;
    const { apiKey, keyId } = pool[idx];
    for (let retry = 0; retry < Math.max(1, retriesPerKey); retry += 1) {
      try {
        if (typeof logFn === 'function') {
          logFn(`NVIDIA NIM request via ${keyId}${retry ? ` (retry ${retry})` : ''}`);
        }
        const text = await chatOnce({
          apiKey,
          messages,
          maxTokens,
          temperature,
          logFn,
        });
        rotationIndex = (idx + 1) % pool.length;
        return { text, keyId };
      } catch (e) {
        lastError = e;
        const status = Number(e?.status || 0);
        const aborted = e?.name === 'AbortError';
        const is429 = status === 429;
        const retryable =
          aborted || status === 401 || status === 403 || is429 || status >= 500;
        if (typeof logFn === 'function') {
          logFn(
            `NVIDIA NIM failed via ${keyId}: status=${status || 'n/a'} ${
              aborted ? 'timeout/abort' : e.message
            }`,
          );
        }
        if (!retryable) break;

        if (is429) {
          const waitMs = rateLimitBackoffMs(retry, e.retryAfterMs);
          if (typeof logFn === 'function') {
            logFn(`NVIDIA NIM 429 backoff ${waitMs}ms then ${retry < retriesPerKey - 1 ? 'retry same key' : 'rotate key'}`);
          }
          await sleep(waitMs);
          // On last retry for this key, fall through to next key
          if (retry >= retriesPerKey - 1) break;
          continue;
        }

        if (retry < retriesPerKey - 1) {
          await sleep(Math.min(8_000, 600 * (retry + 1)));
          continue;
        }
      }
    }
  }

  const err = lastError || new Error('NVIDIA NIM request failed');
  if (err?.name === 'AbortError') {
    throw new Error('NVIDIA NIM request timed out');
  }
  if (Number(err?.status) === 429) {
    const rateErr = new Error(
      'Help chatbot is rate-limited right now. Please wait a moment and try again.',
    );
    rateErr.status = 429;
    throw rateErr;
  }
  throw err;
}

export function nvidiaCredentialStatus() {
  const files = discoverNvidiaKeyFiles().map((f) => path.basename(f));
  const hasEnv = Boolean(String(process.env.NVIDIA_API_KEY || '').trim());
  const multiCount = String(process.env.NVIDIA_API_KEYS || '')
    .split(/[,;\s]+/)
    .filter(Boolean).length;
  return {
    model: NVIDIA_MODEL,
    baseUrl: NVIDIA_BASE_URL,
    envKeyConfigured: hasEnv,
    envKeysCount: multiCount,
    localKeyFiles: files.length,
    localKeyFileNames: files,
    rpmLimit: RPM_LIMIT,
    minGapMs: MIN_GAP_MS,
  };
}
