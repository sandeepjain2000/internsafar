import { query } from '@/lib/db';

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function internshipIdFromLink(link) {
  const m = String(link || '').match(/\/employer\/internships\/([^/?#]+)/);
  return m?.[1] || null;
}

/**
 * Enrich employer notifications with candidate · internship context lines.
 * Uses meta when present; otherwise resolves from internship link + nearby applications.
 */
export async function decorateEmployerNotifications(items, employerUserId) {
  if (!items?.length || !employerUserId) return items || [];

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1 LIMIT 1`, [employerUserId]);
  const employerId = emp.rows[0]?.id;
  if (!employerId) {
    return items.map((n) => ({
      ...n,
      contextLine: employerContextFromFields(n),
    }));
  }

  const internshipIds = new Set();
  for (const n of items) {
    const meta = parseMeta(n.meta);
    if (meta.internshipId) internshipIds.add(String(meta.internshipId));
    const fromLink = internshipIdFromLink(n.link);
    if (fromLink) internshipIds.add(fromLink);
  }

  let appsByIntern = new Map();
  if (internshipIds.size) {
    const apps = await query(
      `SELECT a.id, a.internship_id, a.created_at,
              coalesce(nullif(trim(c.name), ''), nullif(trim(u.name), ''), 'Candidate') AS candidate_name,
              i.title AS internship_title
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_users u ON u.id = c.user_id
       WHERE i.employer_id = $1 AND a.internship_id = ANY($2::text[])
       ORDER BY a.created_at DESC
       LIMIT 500`,
      [employerId, [...internshipIds]],
    );
    for (const row of apps.rows) {
      const list = appsByIntern.get(row.internship_id) || [];
      list.push(row);
      appsByIntern.set(row.internship_id, list);
    }
  }

  return items.map((n) => {
    const meta = parseMeta(n.meta);
    let candidateName = String(meta.candidateName || meta.candidate_name || '').trim();
    let internshipTitle = String(meta.internshipTitle || meta.internship_title || '').trim();
    const internshipId = String(meta.internshipId || internshipIdFromLink(n.link) || '').trim();

    if ((!candidateName || !internshipTitle) && internshipId) {
      const list = appsByIntern.get(internshipId) || [];
      const notifAt = n.created_at ? new Date(n.created_at).getTime() : NaN;
      let best = list[0] || null;
      if (list.length && Number.isFinite(notifAt)) {
        best = list.reduce((acc, row) => {
          const t = new Date(row.created_at).getTime();
          if (!Number.isFinite(t)) return acc;
          if (!acc) return row;
          const accDiff = Math.abs(new Date(acc.created_at).getTime() - notifAt);
          const rowDiff = Math.abs(t - notifAt);
          return rowDiff < accDiff ? row : acc;
        }, null);
      }
      if (best) {
        candidateName = candidateName || best.candidate_name;
        internshipTitle = internshipTitle || best.internship_title;
      }
    }

    // Parse "Name applied for Role" body from newer notifies
    if (!candidateName || !internshipTitle) {
      const body = String(n.body || '');
      const m = body.match(/^(.+?)\s+applied for\s+(.+)$/i);
      if (m) {
        candidateName = candidateName || m[1].trim();
        internshipTitle = internshipTitle || m[2].trim();
      }
    }
    if (!internshipTitle) {
      const body = String(n.body || '');
      const m = body.match(/^New Application For\s+(.+)$/i);
      if (m) internshipTitle = m[1].trim();
    }

    const contextLine = [candidateName, internshipTitle].filter(Boolean).join(' · ')
      || String(n.body || '').trim()
      || '';

    return {
      ...n,
      candidateName: candidateName || null,
      internshipTitle: internshipTitle || null,
      contextLine,
    };
  });
}

function employerContextFromFields(n) {
  const meta = parseMeta(n.meta);
  const candidate = String(meta.candidateName || meta.candidate_name || '').trim();
  const internship = String(meta.internshipTitle || meta.internship_title || '').trim();
  if (candidate && internship) return `${candidate} · ${internship}`;
  if (candidate) return candidate;
  if (internship) return internship;
  return String(n.body || '').trim();
}
