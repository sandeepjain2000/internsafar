/** Best-effort in-process rate limit (per server instance). */
const buckets = new Map();

function prune(bucket, windowMs, now) {
  while (bucket.length && now - bucket[0] >= windowMs) bucket.shift();
}

/**
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
export function checkHelpChatRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const id = String(key || 'anon').slice(0, 200);
  const now = Date.now();
  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = [];
    buckets.set(id, bucket);
  }
  prune(bucket, windowMs, now);
  if (bucket.length >= limit) {
    const retryAfterMs = Math.max(1000, windowMs - (now - bucket[0]));
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  bucket.push(now);
  return { ok: true };
}
