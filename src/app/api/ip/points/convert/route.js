import { requireSession, jsonError } from '@/lib/apiAuth';

/**
 * Convert credits are retired — publish and apply debit points directly.
 * Kept route so old clients get a clear message instead of 404.
 */
export async function POST() {
  const { error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  return jsonError(
    'Point conversion is no longer used. Publish and apply spend points directly (see Refer & earn for rates).',
    410,
  );
}
