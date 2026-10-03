import { query } from '@/lib/db';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { dayString, resumeLinkList, textList } from '@/lib/ipCandidateProfileDisplay';
import { offerIsExpired } from '@/lib/ipOfferPresentation';
import { registrationPathLabel } from '@/lib/ipRegistrationPathLabel';

/** SuperAdmin Candidates list loads every candidate once; the page filters/sorts/pages client-side. */
export const SA_CANDIDATE_LIST_CAP = 5000;

/** Registration signs the user in, so last_login_at within this window of created_at is still the sign-up visit. */
const SIGNUP_SESSION_MS = 60 * 60 * 1000;

const UNDEFINED_TABLE_OR_COLUMN = new Set(['42P01', '42703']);

async function rowsOrEmpty(sql, params) {
  try {
    return (await query(sql, params)).rows;
  } catch (e) {
    if (UNDEFINED_TABLE_OR_COLUMN.has(e?.code)) return [];
    throw e;
  }
}

function iso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function safeHref(raw) {
  const url = text(raw);
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('/api/ip/files?')) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)) return `https://${url}`;
  return null;
}

function candidateName(user, cand) {
  const own = text(cand?.name);
  if (own) return own;
  const parts = [cand?.first_name, cand?.last_name].map(text).filter(Boolean).join(' ');
  return parts || text(user.user_name) || text(user.email) || 'Unnamed candidate';
}

function phoneLabel(cand) {
  const phone = text(cand?.phone);
  if (!phone) return '';
  if (phone.startsWith('+')) return phone;
  const code = text(cand?.phone_country_code);
  return code ? `${code} ${phone}` : phone;
}

function cvHref(cand) {
  return safeHref(cand?.resume_url) || safeHref(resumeLinkList(cand?.resume_links)[0]?.url);
}

function returnedAfterSignup(createdAt, lastLoginAt) {
  if (!lastLoginAt) return false;
  const created = new Date(createdAt).getTime();
  const last = new Date(lastLoginAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(last)) return true;
  return last - created > SIGNUP_SESSION_MS;
}

function nameHiddenOnPosting(showIdentity) {
  return String(showIdentity).toLowerCase() === 'false';
}

function offerStatus(row) {
  return offerIsExpired(row) ? 'expired' : String(row?.status || '').toLowerCase();
}

function signUpMethod(source, googleLinked) {
  const s = String(source || '').toLowerCase();
  if (googleLinked || s === 'google') return 'Google';
  if (s === 'gmail_domain') return 'Gmail sign-up form';
  if (s === 'legacy') return 'Legacy account';
  return registrationPathLabel(source);
}

function baseRow(user, cand) {
  const registeredAt = iso(user.created_at);
  const lastLoginAt = iso(user.last_login_at);
  return {
    id: user.id,
    candidateId: cand?.id || null,
    name: candidateName(user, cand),
    email: text(cand?.email) || text(user.email),
    phone: phoneLabel(cand),
    college: text(cand?.college),
    degree: text(cand?.degree),
    gradYear: cand?.graduation_year != null && cand.graduation_year !== '' ? String(cand.graduation_year) : '',
    city: text(cand?.city),
    state: text(cand?.state),
    country: text(cand?.country),
    profileComplete: Boolean(user.profile_complete),
    active: user.active !== false,
    searchable: cand ? cand.searchable !== false : false,
    registeredAt,
    lastLoginAt,
    returned: returnedAfterSignup(registeredAt, lastLoginAt),
    points: Number(user.points) || 0,
    cvUrl: cvHref(cand),
  };
}

async function loadCompanies(employerIds) {
  const ids = [...new Set(employerIds.filter(Boolean))];
  const [employers, postings] = await Promise.all([
    ids.length
      ? rowsOrEmpty(
          `SELECT id, company_name, hq_city FROM ip_employers WHERE id = ANY($1)`,
          [ids],
        )
      : [],
    ids.length
      ? rowsOrEmpty(
          `SELECT i.id, i.employer_id, i.title, to_jsonb(i)->>'show_employer_identity' AS show_identity
           FROM ip_internships i
           WHERE i.employer_id = ANY($1)
           ORDER BY i.created_at ASC`,
          [ids],
        )
      : [],
  ]);
  const byEmployer = new Map();
  for (const p of postings) {
    if (!byEmployer.has(p.employer_id)) byEmployer.set(p.employer_id, []);
    byEmployer.get(p.employer_id).push({
      id: p.id,
      title: text(p.title) || 'Untitled posting',
      nameHidden: nameHiddenOnPosting(p.show_identity),
    });
  }
  return employers.map((e) => {
    const list = byEmployer.get(e.id) || [];
    return {
      id: e.id,
      name: text(e.company_name) || 'Unnamed company',
      city: text(e.hq_city),
      nameHidden: list.some((p) => p.nameHidden),
      postings: list,
    };
  });
}

export async function listSuperadminCandidates() {
  await ensureIpCandidateProfileSchema();
  const base = await query(
    `SELECT u.id, u.email, u.name AS user_name, u.points, u.profile_complete, u.active,
            u.created_at, u.last_login_at, to_jsonb(c) AS cand
     FROM ip_users u
     LEFT JOIN ip_candidates c ON c.user_id = u.id
     WHERE u.role = 'candidate'
     ORDER BY u.created_at DESC
     LIMIT $1`,
    [SA_CANDIDATE_LIST_CAP + 1],
  );
  const truncated = base.rows.length > SA_CANDIDATE_LIST_CAP;
  const users = base.rows.slice(0, SA_CANDIDATE_LIST_CAP);

  const rows = users.map((u) => ({ ...baseRow(u, u.cand), applications: [], offers: [], contacts: [] }));
  const byCandidateId = new Map();
  const byUserId = new Map();
  for (const r of rows) {
    if (r.candidateId) byCandidateId.set(r.candidateId, r);
    byUserId.set(r.id, r);
  }
  const candidateIds = [...byCandidateId.keys()];
  const userIds = [...byUserId.keys()];

  const [apps, offers, contacts, allEmployers] = await Promise.all([
    candidateIds.length
      ? rowsOrEmpty(
          `SELECT a.id, a.candidate_id, a.status, a.created_at, a.updated_at, a.internship_id,
                  i.title, i.employer_id, to_jsonb(i)->>'show_employer_identity' AS show_identity
           FROM ip_applications a
           JOIN ip_internships i ON i.id = a.internship_id
           WHERE a.candidate_id = ANY($1)`,
          [candidateIds],
        )
      : [],
    candidateIds.length
      ? rowsOrEmpty(
          `SELECT candidate_id, employer_id, status, valid_until FROM ip_offers WHERE candidate_id = ANY($1)`,
          [candidateIds],
        )
      : [],
    userIds.length
      ? rowsOrEmpty(
          `SELECT t.candidate_user_id, e.id AS employer_id, MIN(t.created_at) AS created_at
           FROM ip_message_threads t
           JOIN ip_employers e ON e.user_id = t.employer_user_id
           WHERE t.application_id IS NULL AND t.candidate_user_id = ANY($1)
           GROUP BY t.candidate_user_id, e.id`,
          [userIds],
        )
      : [],
    rowsOrEmpty(`SELECT id FROM ip_employers`, []),
  ]);

  for (const a of apps) {
    const row = byCandidateId.get(a.candidate_id);
    if (!row) continue;
    row.applications.push({
      id: a.id,
      employerId: a.employer_id,
      postingId: a.internship_id,
      postingTitle: text(a.title) || 'Untitled posting',
      status: String(a.status || '').toLowerCase(),
      appliedAt: iso(a.created_at),
      updatedAt: iso(a.updated_at) || iso(a.created_at),
      nameHidden: nameHiddenOnPosting(a.show_identity),
    });
  }
  for (const o of offers) {
    const row = byCandidateId.get(o.candidate_id);
    if (row) row.offers.push({ employerId: o.employer_id, status: offerStatus(o) });
  }
  for (const t of contacts) {
    const row = byUserId.get(t.candidate_user_id);
    if (row) row.contacts.push({ employerId: t.employer_id, at: iso(t.created_at) });
  }

  const companies = await loadCompanies(allEmployers.map((e) => e.id));
  return { candidates: rows, companies, truncated, cap: SA_CANDIDATE_LIST_CAP };
}

const CANDIDATE_STATUS_ACTOR = {
  applied: 'candidate',
  reapplied: 'candidate',
  withdrawn: 'candidate',
  declined_offer: 'candidate',
};

function actorFromRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'candidate' || r === 'employer' || r === 'superadmin') return r;
  return 'system';
}

function buildApplicationEvents(app, events, offers) {
  const list = [];
  for (const e of events) {
    const type = String(e.event_type || '').toLowerCase();
    const at = iso(e.created_at);
    const prior = type === 'reapplied' ? String(e.payload?.priorStatus || '').toLowerCase() : '';
    // Withdraw is not logged as its own event; the reapply payload records it without a time.
    if (prior) list.push({ type: prior, actor: CANDIDATE_STATUS_ACTOR[prior] || 'employer', at, before: true });
    list.push({ type, actor: actorFromRole(e.actor_role), at });
  }
  const has = (type) => list.some((e) => e.type === type && !e.before);
  if (!has('applied') && !has('reapplied')) {
    list.push({ type: 'applied', actor: 'candidate', at: iso(app.created_at) });
  }
  for (const o of offers) {
    if (!has('offered')) list.push({ type: 'offer_sent', actor: 'employer', at: iso(o.created_at) });
    const s = String(o.status || '').toLowerCase();
    if (o.responded_at && (s === 'accepted' || s === 'declined')) {
      list.push({ type: s === 'accepted' ? 'offer_accepted' : 'offer_declined', actor: 'candidate', at: iso(o.responded_at) });
    }
  }
  const status = String(app.status || '').toLowerCase();
  const coveredByOffer =
    (status === 'hired' && list.some((e) => e.type === 'offer_accepted')) ||
    (status === 'declined_offer' && list.some((e) => e.type === 'offer_declined')) ||
    (status === 'offered' && list.some((e) => e.type === 'offer_sent'));
  if (status && !has(status) && !coveredByOffer) {
    list.push({
      type: status,
      actor: CANDIDATE_STATUS_ACTOR[status] || 'employer',
      at: iso(app.updated_at) || iso(app.created_at),
    });
  }
  return list.filter((e) => e.at).sort((x, y) => x.at.localeCompare(y.at));
}

function academicRows(cand, academics) {
  const rows = academics.length
    ? academics
    : cand?.college || cand?.degree
      ? [{ degree: cand.degree, specialization: cand.specialization, college: cand.college, graduation_year: cand.graduation_year, cgpa: cand.cgpa, study_status: cand.study_status }]
      : [];
  return rows.map((r) => {
    const title = [text(r.degree), text(r.specialization)].filter(Boolean).join(' · ') || text(r.row_label) || 'Education';
    const cgpa = text(r.cgpa);
    const n = Number(cgpa);
    const score = !cgpa ? '' : Number.isFinite(n) && n > 10 && n <= 100 ? `${cgpa}%` : Number.isFinite(n) ? `${cgpa} CGPA` : cgpa;
    return {
      title,
      label: text(r.row_label),
      institution: text(r.college),
      year: r.graduation_year != null && r.graduation_year !== '' ? String(r.graduation_year) : '',
      studyStatus: text(r.study_status),
      score,
    };
  });
}

function profileLinks(cand) {
  const named = [
    ['LinkedIn', cand?.linkedin_url],
    ['GitHub', cand?.github_url],
    ['Portfolio', cand?.portfolio_url],
    ['Website', cand?.personal_website],
  ];
  const out = [];
  for (const [label, raw] of named) {
    const href = safeHref(raw);
    if (href) out.push({ label, href, display: text(raw) });
  }
  for (const l of resumeLinkList(cand?.resume_links)) {
    const href = safeHref(l.url);
    if (href) out.push({ label: l.title || 'CV link', href, display: l.url });
  }
  return out;
}

export async function getSuperadminCandidateDetail(userId) {
  await ensureIpCandidateProfileSchema();
  const base = await query(
    `SELECT u.id, u.email, u.name AS user_name, u.points, u.profile_complete, u.active,
            u.created_at, u.last_login_at, u.referral_code, u.referred_by, u.registration_source,
            to_jsonb(c) AS cand
     FROM ip_users u
     LEFT JOIN ip_candidates c ON c.user_id = u.id
     WHERE u.id = $1 AND u.role = 'candidate'
     LIMIT 1`,
    [userId],
  );
  const user = base.rows[0];
  if (!user) return null;
  const cand = user.cand;
  const candidateId = cand?.id || null;

  const [academics, apps, offers, contacts, google, referrer, referrals] = await Promise.all([
    candidateId
      ? rowsOrEmpty(
          `SELECT row_label, college, degree, specialization, study_status, graduation_year, cgpa
           FROM ip_candidate_academics WHERE candidate_id = $1
           ORDER BY sort_order ASC, created_at ASC`,
          [candidateId],
        )
      : [],
    candidateId
      ? rowsOrEmpty(
          `SELECT a.id, a.status, a.match_score, a.created_at, a.updated_at, a.internship_id,
                  i.title, i.employer_id, to_jsonb(i)->>'show_employer_identity' AS show_identity
           FROM ip_applications a
           JOIN ip_internships i ON i.id = a.internship_id
           WHERE a.candidate_id = $1
           ORDER BY a.updated_at DESC`,
          [candidateId],
        )
      : [],
    candidateId
      ? rowsOrEmpty(
          `SELECT id, employer_id, application_id, role_title, stipend_inr, start_date, valid_until,
                  status, created_at, responded_at
           FROM ip_offers WHERE candidate_id = $1
           ORDER BY created_at DESC`,
          [candidateId],
        )
      : [],
    rowsOrEmpty(
      `SELECT e.id AS employer_id, MIN(t.created_at) AS created_at
       FROM ip_message_threads t
       JOIN ip_employers e ON e.user_id = t.employer_user_id
       WHERE t.application_id IS NULL AND t.candidate_user_id = $1
       GROUP BY e.id`,
      [userId],
    ),
    rowsOrEmpty(`SELECT 1 FROM ip_google_identities WHERE user_id = $1 LIMIT 1`, [userId]),
    user.referred_by
      ? rowsOrEmpty(`SELECT id, name, email, role FROM ip_users WHERE id = $1`, [user.referred_by])
      : [],
    rowsOrEmpty(
      `SELECT id, name, email, role FROM ip_users WHERE referred_by = $1 ORDER BY created_at ASC`,
      [userId],
    ),
  ]);

  const appIds = apps.map((a) => a.id);
  const events = appIds.length
    ? await rowsOrEmpty(
        `SELECT e.application_id, e.event_type, e.payload, e.created_at, au.role AS actor_role
         FROM ip_application_events e
         LEFT JOIN ip_users au ON au.id = e.actor_user_id
         WHERE e.application_id = ANY($1) AND e.event_type <> 'export'
         ORDER BY e.created_at ASC`,
        [appIds],
      )
    : [];

  const employerIds = [
    ...apps.map((a) => a.employer_id),
    ...offers.map((o) => o.employer_id),
    ...contacts.map((c) => c.employer_id),
  ];
  const companies = await loadCompanies(employerIds);

  const applications = apps.map((a) => {
    const own = events.filter((e) => e.application_id === a.id);
    const appOffers = offers.filter((o) => o.application_id === a.id);
    return {
      id: a.id,
      employerId: a.employer_id,
      postingId: a.internship_id,
      postingTitle: text(a.title) || 'Untitled posting',
      status: String(a.status || '').toLowerCase(),
      matchScore: a.match_score != null ? Number(a.match_score) : null,
      appliedAt: iso(a.created_at),
      updatedAt: iso(a.updated_at) || iso(a.created_at),
      nameHidden: nameHiddenOnPosting(a.show_identity),
      reapplied: own.some((e) => String(e.event_type).toLowerCase() === 'reapplied'),
      events: buildApplicationEvents(a, own, appOffers),
    };
  });

  const personRef = (p) => ({ id: p.id, name: text(p.name) || text(p.email), isCandidate: p.role === 'candidate' });

  return {
    candidate: {
      ...baseRow(user, cand),
      specialization: text(cand?.specialization),
      studyStatus: text(cand?.study_status),
      cgpa: text(cand?.cgpa),
      links: profileLinks(cand),
      workMode: text(cand?.preferred_work_mode),
      preferredLocations: textList(cand?.preferred_locations),
      preferredRoles: textList(cand?.preferred_roles),
      availabilityDate: dayString(cand?.availability_date) || null,
      immediateStart: Boolean(cand?.immediate_start),
      willingToRelocate: Boolean(cand?.willing_to_relocate),
      skills: textList(cand?.skills),
      hasProfileRow: Boolean(cand),
      referralCode: text(user.referral_code),
      signUpMethod: signUpMethod(user.registration_source, google.length > 0),
      referredBy: referrer[0] ? personRef(referrer[0]) : null,
      referrals: referrals.map(personRef),
      academics: academicRows(cand, academics),
    },
    applications,
    offers: offers.map((o) => ({
      id: o.id,
      employerId: o.employer_id,
      applicationId: o.application_id,
      role: text(o.role_title),
      stipend: o.stipend_inr != null ? Number(o.stipend_inr) : null,
      startDate: dayString(o.start_date) || null,
      validUntil: dayString(o.valid_until) || null,
      status: offerStatus(o),
      createdAt: iso(o.created_at),
      respondedAt: iso(o.responded_at),
    })),
    contacts: contacts.map((c) => ({ employerId: c.employer_id, at: iso(c.created_at) })),
    companies,
  };
}
