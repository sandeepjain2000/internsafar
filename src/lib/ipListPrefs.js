import { query } from '@/lib/db';

function parseFilters(raw) {
  let filters = raw;
  if (typeof filters === 'string') {
    try {
      filters = JSON.parse(filters);
    } catch {
      filters = {};
    }
  }
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  return filters;
}

/**
 * Saved list view for a user/table: default preset wins over last-used prefs
 * (same rule as useListPrefsSync hydration). Caller must have run ensureIpWorkbenchSchema.
 */
export async function loadSavedListView(userId, tableKey) {
  const preset = await query(
    `SELECT filters, sort FROM ip_saved_applicant_views
     WHERE user_id = $1 AND table_key = $2 AND is_default
     LIMIT 1`,
    [userId, tableKey],
  );
  if (preset.rows[0]) {
    return { filters: parseFilters(preset.rows[0].filters), sort: preset.rows[0].sort ?? '' };
  }
  const prefs = await query(
    `SELECT filters, sort FROM ip_table_filter_prefs WHERE user_id = $1 AND table_key = $2`,
    [userId, tableKey],
  );
  const row = prefs.rows[0];
  return { filters: parseFilters(row?.filters), sort: row?.sort ?? '' };
}
