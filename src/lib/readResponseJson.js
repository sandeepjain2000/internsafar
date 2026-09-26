/**
 * Parse a fetch Response as JSON without throwing on empty / non-JSON bodies
 * (common during Vercel cutovers, 204s, and proxy errors).
 */
export async function readResponseJson(res, fallback = {}) {
  try {
    const text = await res.text();
    if (!text || !String(text).trim()) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
