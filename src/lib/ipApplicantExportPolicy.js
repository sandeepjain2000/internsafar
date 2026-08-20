/** Pure export policy helpers (no DB) — safe for Node unit tests. */

export const SYNC_EXPORT_THRESHOLD = 15;

export function shouldUseBackgroundJob(applicationIds, includeResumes) {
  const n = Array.isArray(applicationIds) ? applicationIds.length : 0;
  if (includeResumes) return n > 3;
  return n > SYNC_EXPORT_THRESHOLD;
}
