import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { skillMatchPercent } from '@/lib/skillMatch';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { experienceYears } from '@/lib/ipCandidateExperience';

function availabilityBucket(row) {
  if (row.immediate_start) return 'immediate';
  if (row.availability_date) {
    const t = new Date(row.availability_date).getTime();
    if (!Number.isNaN(t)) {
      const days = (t - Date.now()) / 86400000;
      if (days <= 14) return '2weeks';
      if (days <= 31) return '1month';
    }
  }
  return 'later';
}

/** Search searchable candidate profiles. Hides phone/email/CV per privacy rule. */
export async function GET(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const skill = (searchParams.get('skill') || '').trim().toLowerCase();
  const internshipId = (searchParams.get('internshipId') || '').trim();
  const city = (searchParams.get('city') || '').trim().toLowerCase();
  const degree = (searchParams.get('degree') || '').trim().toLowerCase();
  const workMode = (searchParams.get('workMode') || '').trim().toLowerCase();
  const chip = (searchParams.get('chip') || 'all').trim().toLowerCase();
  const sort = (searchParams.get('sort') || '').trim();
  const minCgpa = Number(searchParams.get('minCgpa') || 0);
  const experience = (searchParams.get('experience') || '').trim().toLowerCase();
  const availability = (searchParams.get('availability') || '').trim().toLowerCase();
  const freshnessDays = Number(searchParams.get('freshnessDays') || 0);

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const employerId = emp.rows[0]?.id || null;

  const where = ['c.searchable = true'];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(
      `(lower(c.name) LIKE $${i} OR lower(c.college) LIKE $${i} OR lower(c.degree) LIKE $${i} OR lower(c.city) LIKE $${i} OR lower(coalesce(c.specialization,'')) LIKE $${i} OR EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) LIKE $${i}))`,
    );
  }
  if (skill && skill !== 'all') {
    params.push(skill);
    where.push(`EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) = $${params.length})`);
  }
  if (city) {
    const cities = city.split(',').map((s) => s.trim()).filter(Boolean);
    if (cities.length) {
      const parts = cities.map((c) => {
        params.push(`%${c}%`);
        return `lower(coalesce(c.city,'')) LIKE $${params.length}`;
      });
      where.push(`(${parts.join(' OR ')})`);
    }
  }
  if (degree) {
    params.push(`%${degree}%`);
    where.push(`lower(coalesce(c.degree,'')) LIKE $${params.length}`);
  }
  if (workMode) {
    params.push(workMode);
    where.push(`lower(coalesce(c.preferred_work_mode,'')) = $${params.length}`);
  }
  if (minCgpa > 0) {
    params.push(minCgpa);
    where.push(`c.cgpa IS NOT NULL AND c.cgpa >= $${params.length}`);
  }
  if (freshnessDays > 0) {
    params.push(freshnessDays);
    where.push(`c.updated_at >= now() - ($${params.length}::text || ' days')::interval`);
  }

  let eligibility = null;
  if (internshipId && employerId) {
    const posting = await query(
      `SELECT eligibility FROM ip_internships WHERE id = $1 AND employer_id = $2`,
      [internshipId, employerId],
    );
    if (posting.rows[0]) {
      eligibility = posting.rows[0].eligibility;
      if (typeof eligibility === 'string') {
        try {
          eligibility = JSON.parse(eligibility);
        } catch {
          eligibility = null;
        }
      }
    }
  }

  const result = await query(
    `SELECT c.id, c.user_id, c.name, c.college, c.degree, c.specialization, c.city, c.state, c.skills,
            c.study_status, c.graduation_year, c.cgpa, c.availability_date, c.show_completed_internships,
            c.preferred_work_mode, c.ongoing_commitment, c.ongoing_commitment_note,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS profile_picture_url,
            c.has_wired_broadband, c.has_dedicated_laptop,
            c.preferred_hours_start, c.preferred_hours_end,
            c.immediate_start, c.willing_to_relocate, c.prior_experience, c.updated_at
     FROM ip_candidates c WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 200`,
    params,
  );

  const ids = result.rows.map((r) => r.id);
  const relByCand = new Map();
  if (employerId && ids.length) {
    const rel = await query(
      `SELECT a.candidate_id,
              bool_or(a.status IN ('shortlisted','interviewing','offered','hired')) AS shortlisted,
              bool_or(true) AS applied,
              max(a.status) AS latest_status
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE i.employer_id = $1 AND a.candidate_id = ANY($2::text[])
       GROUP BY a.candidate_id`,
      [employerId, ids],
    );
    for (const row of rel.rows) {
      relByCand.set(row.candidate_id, {
        applied: true,
        shortlisted: Boolean(row.shortlisted),
        latestStatus: row.latest_status,
      });
    }
    const invited = await query(
      `SELECT c.id as candidate_id, t.internship_id, i.title
       FROM ip_candidates c
       JOIN ip_message_threads t ON t.candidate_user_id = c.user_id
       LEFT JOIN ip_internships i ON i.id = t.internship_id
       WHERE t.employer_user_id = $1 AND c.id = ANY($2::text[])`,
      [session.user.id, ids],
    );
    for (const row of invited.rows) {
      const prev = relByCand.get(row.candidate_id) || {};
      relByCand.set(row.candidate_id, {
        ...prev,
        invited: true,
        inviteInternshipTitle: row.title || prev.inviteInternshipTitle,
      });
    }
  }

  let items = result.rows.map((row) => {
    const rel = relByCand.get(row.id) || {};
    const years = experienceYears(row.prior_experience);
    const item = {
      ...row,
      experience_years: years,
      availability_bucket: availabilityBucket(row),
      relationship: {
        applied: Boolean(rel.applied),
        invited: Boolean(rel.invited),
        shortlisted: Boolean(rel.shortlisted),
        inviteInternshipTitle: rel.inviteInternshipTitle || null,
        latestStatus: rel.latestStatus || null,
      },
      match_score: internshipId && eligibility !== null ? skillMatchPercent(row.skills, eligibility) : null,
    };
    item.match_why =
      item.match_score == null
        ? null
        : `${Math.round(item.match_score)}% = skill overlap with the selected posting’s eligibility skills` +
          (item.immediate_start ? '; availability aligned' : '') +
          (item.city ? '; location on profile' : '');
    return item;
  });

  items = items.filter((c) => {
    if (experience === 'none' && c.experience_years > 0) return false;
    if (experience === '1plus' && c.experience_years < 1) return false;
    if (experience === '2plus' && c.experience_years < 2) return false;
    if (availability === 'immediate' && c.availability_bucket !== 'immediate') return false;
    if (availability === '2weeks' && !['immediate', '2weeks'].includes(c.availability_bucket)) return false;
    if (availability === '1month' && c.availability_bucket === 'later') return false;
    if (chip === 'available' && c.availability_bucket === 'later') return false;
    if (chip === 'shortlisted' && !c.relationship.shortlisted) return false;
    if (chip === 'new') {
      const t = new Date(c.updated_at).getTime();
      if (Number.isNaN(t) || Date.now() - t > 7 * 86400000) return false;
    }
    if (chip === 'experience' && c.experience_years <= 0) return false;
    return true;
  });

  if (sort === 'match' || (internshipId && eligibility !== null && !sort)) {
    items.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  } else if (sort === 'availability') {
    const rank = { immediate: 0, '2weeks': 1, '1month': 2, later: 3 };
    items.sort((a, b) => (rank[a.availability_bucket] ?? 9) - (rank[b.availability_bucket] ?? 9));
  } else if (sort === 'experience') {
    items.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0));
  } else {
    items.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  }

  const summary = {
    found: items.length,
    roleMatches: items.filter((c) => (c.match_score ?? 0) >= 70).length,
    shortlisted: items.filter((c) => c.relationship.shortlisted).length,
    invitesPending: items.filter((c) => c.relationship.invited && !c.relationship.applied).length,
  };

  return jsonOk({
    items,
    summary,
    matchAgainst: internshipId || null,
    matchReady: Boolean(internshipId && eligibility !== null),
  });
}
