import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { computeValidationScore } from '@/lib/internshipValidationScore';
import { skillMatchPercent } from '@/lib/skillMatch';

function eligibilitySkills(eligibility) {
  let el = eligibility;
  if (typeof el === 'string') {
    try {
      el = JSON.parse(el);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(el?.skills)) return [];
  return el.skills.map((s) => String(s).trim()).filter(Boolean);
}

function modeKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

function matchesWorkMode(itemMode, filterMode) {
  if (!filterMode || filterMode === 'all') return true;
  const a = modeKey(itemMode);
  const b = modeKey(filterMode);
  if (a === b) return true;
  return (a === 'onsite' || a === 'onsiteonly') && (b === 'onsite' || b === 'onsiteonly');
}

function matchesLocation(item, locFilter) {
  if (!locFilter || locFilter === 'all') return true;
  const loc = String(item.location || '').toLowerCase();
  const want = locFilter.toLowerCase();
  if (loc === want) return true;
  if (modeKey(item.work_mode) === 'remote') return true;
  return false;
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = [
    item.title,
    item.company_name,
    item.location,
    item.work_mode,
    ...(item.skill_tags || []),
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

function sortItems(items, sort) {
  const copy = [...items];
  if (sort === 'best-match') {
    copy.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  } else if (sort === 'highest-stipend') {
    copy.sort((a, b) => Number(b.stipend_inr || 0) - Number(a.stipend_inr || 0));
  } else if (sort === 'earliest-start') {
    copy.sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.start_date ? new Date(b.start_date).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  } else {
    copy.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
  return copy;
}

export async function GET(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const minStipend = Number(searchParams.get('minStipend') || 0);
  const workMode = searchParams.get('workMode') || '';
  const location = (searchParams.get('location') || '').trim();
  const minMatch = Number(searchParams.get('minMatch') || 0);
  const minValidation = Number(searchParams.get('minValidation') || 0);
  const savedOnly = searchParams.get('savedOnly') === '1';
  const recommended = searchParams.get('recommended') === '1';
  const sort = searchParams.get('sort') || (recommended ? 'best-match' : 'newest');

  const candResult = await query(`SELECT id, skills FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const candidateId = candResult.rows[0]?.id;
  const skills = candResult.rows[0]?.skills || [];

  const result = await query(
    `SELECT i.*,
            e.id as employer_row_id,
            e.company_name,
            e.logo_url,
            e.show_hiring_numbers,
            e.historical_hires,
            e.approval_status,
            e.work_email,
            e.website,
            e.linkedin_url,
            e.ethics_acks,
            e.ethics_accepted_at,
            e.updated_at as employer_updated_at
     FROM ip_internships i
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE i.status = 'published'
     ORDER BY i.created_at DESC
     LIMIT 200`,
  );

  const employerIds = [...new Set(result.rows.map((r) => r.employer_id).filter(Boolean))];
  const docsByEmployer = new Map();
  if (employerIds.length) {
    const docs = await query(
      `SELECT id, employer_id, doc_type, review_status, reviewed_at, created_at
       FROM ip_employer_documents
       WHERE employer_id = ANY($1::text[])`,
      [employerIds],
    );
    for (const row of docs.rows) {
      const list = docsByEmployer.get(row.employer_id) || [];
      list.push(row);
      docsByEmployer.set(row.employer_id, list);
    }
  }

  let savedIds = new Set();
  let appliedIds = new Set();
  if (candidateId) {
    const saved = await query(`SELECT internship_id FROM ip_saved_internships WHERE candidate_id = $1`, [candidateId]);
    savedIds = new Set(saved.rows.map((r) => r.internship_id));
    const applied = await query(`SELECT internship_id FROM ip_applications WHERE candidate_id = $1`, [candidateId]);
    appliedIds = new Set(applied.rows.map((r) => r.internship_id));
  }

  const mapped = result.rows.map((r) => {
    const validation = computeValidationScore({
      employer: {
        approval_status: r.approval_status,
        work_email: r.work_email,
        website: r.website,
        linkedin_url: r.linkedin_url,
        ethics_acks: r.ethics_acks,
        ethics_accepted_at: r.ethics_accepted_at,
        updated_at: r.employer_updated_at,
      },
      documents: docsByEmployer.get(r.employer_id) || [],
      internship: r,
    });
    const skill_tags = eligibilitySkills(r.eligibility);
    return {
      ...r,
      company_name: r.show_employer_identity ? r.company_name : 'Confidential employer',
      match_score: skillMatchPercent(skills, r.eligibility),
      saved: savedIds.has(r.id),
      applied: appliedIds.has(r.id),
      skill_tags,
      employer_verified: String(r.approval_status || '').toLowerCase() === 'approved',
      validation_score: validation.validation_score,
      validation_label: validation.validation_label,
      validation_breakdown: validation.validation_breakdown,
    };
  });

  const counts = {
    all: mapped.length,
    saved: mapped.filter((i) => i.saved).length,
    recommended: mapped.filter((i) => (i.match_score ?? 0) >= 85).length,
  };

  let items = mapped.filter((i) => {
    if (savedOnly && !i.saved) return false;
    if (!matchesQuery(i, q)) return false;
    if (minStipend && Number(i.stipend_inr || 0) < minStipend) return false;
    if (!matchesWorkMode(i.work_mode, workMode)) return false;
    if (!matchesLocation(i, location)) return false;
    if (minMatch && (i.match_score ?? 0) < minMatch) return false;
    if (minValidation && (i.validation_score ?? 0) < minValidation) return false;
    return true;
  });

  items = sortItems(items, sort);
  if (recommended) items = items.slice(0, 12);

  return jsonOk({ items, counts });
}
