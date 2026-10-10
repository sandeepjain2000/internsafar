/**
 * InternSafar TC-IS cases (no Legacy ID) — called from the combined QA runner.
 * OTP / mail codes: local .env.local only (IP_QA_2FA_LOGIN_CODE).
 * Email-change OTP (TC-IS-06-007): manual script only — see scripts/manual/.
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { QA_ACCOUNTS, apiLogin, apiRequest } from './ipQaAuth.mjs';
import { ensureCoreQaAccountsReady } from './ipQaFixtureCases.mjs';
import {
  runTcIs02023,
  runTcIs06006,
  runNotRunEleven,
  runTcIs12010,
  withDb,
} from './ipQaRemainingExtras.mjs';
import { runLatestUpdateTcIsCases } from './ipQaLatestUpdateCases.mjs';
import { employerCanSeeCandidatePhone } from '../../src/lib/ipCandidatePhonePrivacy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

/**
 * @param {{ base?: string, skipEnsureReady?: boolean }} [opts]
 * @returns {Promise<{ byTcId: Record<string, {status:string, actual:string}>, executedAt: string, base: string }>}
 */
export async function runRemainingSuite(opts = {}) {
  const BASE = opts.base || process.env.IP_BASE || 'http://localhost:3000';
  const byTcId = {};
  const executedAt = new Date().toISOString();

  function pass(id, actual) {
    byTcId[id] = { status: 'Pass', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function fail(id, actual) {
    byTcId[id] = { status: 'Fail', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function blocked(id, actual) {
    byTcId[id] = { status: 'Blocked', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function assess(id, ok, actual) {
    (ok ? pass : fail)(id, actual);
  }

  if (!opts.skipEnsureReady) {
    await ensureCoreQaAccountsReady().catch((e) => console.warn('ensureCoreQaAccountsReady:', e.message || e));
  }

  const cand = await apiLogin(BASE, QA_ACCOUNTS.candidate.email, QA_ACCOUNTS.candidate.password);
  const emp = await apiLogin(BASE, QA_ACCOUNTS.employer.email, QA_ACCOUNTS.employer.password);
  const sa = await apiLogin(BASE, QA_ACCOUNTS.superadmin.email, QA_ACCOUNTS.superadmin.password);
  if (!cand.ok || !emp.ok || !sa.ok) {
    throw new Error(`login failed cand=${cand.ok} emp=${emp.ok} sa=${sa.ok}`);
  }

  await runTcIs02023({ BASE, assess, blocked });

  blocked(
    'TC-IS-03-018',
    'Manual only — registration/account creation excluded from automated QA suite',
  );

  await runTcIs06006({ BASE, assess, blocked, cand });
  // TC-IS-06-007 — manual OTP (email change). Not run here; see scripts/manual/run-tc-is-06-007-email-change.mjs

  const list0 = await apiRequest(BASE, '/api/ip/candidate/internships?minMatch=0', { cookie: cand.cookie });
  const list1 = await apiRequest(BASE, '/api/ip/candidate/internships?minMatch=1', { cookie: cand.cookie });
  const list100 = await apiRequest(BASE, '/api/ip/candidate/internships?minMatch=100', { cookie: cand.cookie });
  const asItems = (r) => {
    const v = r.data?.items || r.data?.internships || [];
    return Array.isArray(v) ? v : [];
  };
  const items0 = asItems(list0);
  const items1 = asItems(list1);
  const items100 = asItems(list100);
  // No required skills on the posting = 100% match, so it must survive any minMatch filter.
  const emptyElig = items0.filter((i) => i.eligibility && typeof i.eligibility === 'object'
    && !(Array.isArray(i.eligibility.skills) && i.eligibility.skills.some((s) => String(s || '').trim())));
  const below1 = items1.filter((i) => !(Number(i.match_score) >= 1)).map((i) => i.id);
  const below100 = items100.filter((i) => !(Number(i.match_score) >= 100)).map((i) => i.id);
  const emptyNot100 = emptyElig.filter((i) => Number(i.match_score) !== 100).map((i) => i.id);
  assess(
    'TC-IS-07-016',
    list0.status === 200 && list1.status === 200 && list100.status === 200 && items0.length > 0
      && below1.length === 0 && below100.length === 0 && emptyNot100.length === 0,
    {
      n0: items0.length,
      n1: items1.length,
      n100: items100.length,
      emptyEligibilitySkillsSeen: emptyElig.length,
      below1,
      below100,
      emptyNot100,
    },
  );

  const prof = await apiRequest(BASE, '/api/ip/candidate/profile', { cookie: cand.cookie });
  const ledger = await apiRequest(BASE, '/api/ip/points/ledger', { cookie: cand.cookie });

  const internships = await apiRequest(BASE, '/api/ip/employer/internships', { cookie: emp.cookie });
  const internId = internships.data?.items?.[0]?.id || internships.data?.[0]?.id;
  const bulkUnknown = internId
    ? await apiRequest(BASE, `/api/ip/employer/internships/${internId}/applicants/bulk`, {
        method: 'POST',
        cookie: emp.cookie,
        body: { action: 'shortlist', applicationIds: ['not-an-owned-app'] },
      })
    : { status: 0, data: { error: 'no posting' } };
  assess(
    'TC-IS-09-009',
    internId
      ? bulkUnknown.status >= 400 && bulkUnknown.status < 500
      : false,
    { internId, bulkStatus: bulkUnknown.status, error: bulkUnknown.data?.error },
  );

  const tplGet = await apiRequest(BASE, '/api/ip/employer/rejection-templates', { cookie: emp.cookie });
  const tplName = `QA tpl ${Date.now()}`;
  const tplPost = await apiRequest(BASE, '/api/ip/employer/rejection-templates', {
    method: 'POST',
    cookie: emp.cookie,
    body: { name: tplName, body: 'Thank you {{candidateName}} for applying to {{internshipTitle}}.' },
  });
  const tplId = tplPost.data?.id;
  if (tplId) {
    await apiRequest(BASE, `/api/ip/employer/rejection-templates?id=${encodeURIComponent(tplId)}`, {
      method: 'DELETE',
      cookie: emp.cookie,
    });
  }
  assess(
    'TC-IS-09-010',
    tplGet.status === 200 && (tplPost.status === 201 || tplPost.status === 200) && Boolean(tplId || tplPost.data?.ok),
    { get: tplGet.status, post: tplPost.status, id: tplId },
  );

  // TC-IS-09-011: selected applicants export inline (sync path) as .xlsx with the phone only where
  // the privacy rule allows; with CVs as a ZIP holding applicants.xlsx (+ resumes/ when a CV file is
  // stored). Empty selection is refused. Prefers a posting with one hidden and one visible phone.
  {
    const apps = await withDb(async (db) => (await db.query(
      `SELECT a.id, a.internship_id, a.status, c.hide_phone_until_shortlist AS hide, c.phone
       FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_users u ON u.id = e.user_id
       WHERE lower(u.email) = lower($1)
       ORDER BY a.created_at DESC LIMIT 300`,
      [QA_ACCOUNTS.employer.email],
    )).rows);
    const withRule = apps.map((a) => ({
      ...a,
      phoneVisible: Boolean(a.phone) && employerCanSeeCandidatePhone(a.status, a.hide !== false),
    }));
    const byPosting = new Map();
    for (const a of withRule) byPosting.set(a.internship_id, [...(byPosting.get(a.internship_id) || []), a]);
    let picked = [];
    for (const list of byPosting.values()) {
      const shown = list.find((a) => a.phoneVisible);
      const hidden = list.find((a) => !a.phoneVisible && a.phone);
      if (shown && hidden) {
        picked = [hidden, shown];
        break;
      }
    }
    if (!picked.length && withRule[0]) picked = [withRule[0]];
    if (!picked.length) {
      fail('TC-IS-09-011', 'The test employer has no applications to export');
    } else {
      const target = picked[0];
      const bulk = (body) => apiRequest(BASE, `/api/ip/employer/internships/${target.internship_id}/applicants/bulk`, {
        method: 'POST', cookie: emp.cookie, body: { action: 'export', ...body },
      });
      const empty = await bulk({ applicationIds: [] });
      const plain = await bulk({ applicationIds: picked.map((a) => a.id) });
      const withCv = await bulk({ applicationIds: [target.id], includeResumes: true });
      const xlsx = Buffer.from(plain.data?.xlsxBase64 || '', 'base64');
      const phoneCells = {};
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(xlsx);
        const ws = wb.worksheets[0];
        const header = ws.getRow(1).values.map((v) => String(v ?? '').trim().toLowerCase());
        const idCol = header.indexOf('application_id');
        const phoneCol = header.indexOf('phone');
        ws.eachRow((row, n) => {
          if (n === 1 || idCol < 0 || phoneCol < 0) return;
          phoneCells[String(row.getCell(idCol).value ?? '')] = String(row.getCell(phoneCol).value ?? '');
        });
      } catch {
        /* phoneCells stays empty → fails below */
      }
      const phoneWrong = picked.filter((a) => (phoneCells[a.id] ?? null) !== (a.phoneVisible ? String(a.phone) : ''))
        .map((a) => ({ id: a.id, status: a.status, expectVisible: a.phoneVisible, cell: phoneCells[a.id] ?? 'row missing' }));
      let zipFiles = [];
      try {
        const zip = await JSZip.loadAsync(Buffer.from(withCv.data?.zipBase64 || '', 'base64'));
        zipFiles = Object.keys(zip.files);
      } catch {
        zipFiles = [];
      }
      const resumes = zipFiles.filter((f) => f.startsWith('resumes/') && !f.endsWith('/'));
      assess(
        'TC-IS-09-011',
        empty.status === 400 && /select at least one/i.test(empty.data?.error || '')
          && plain.status === 200 && plain.data?.format === 'xlsx' && plain.data?.filename === 'applicants-export.xlsx'
          && xlsx.subarray(0, 2).toString('latin1') === 'PK' && !phoneWrong.length
          && withCv.status === 200 && withCv.data?.format === 'zip' && withCv.data?.filename === 'applicants-export.zip'
          && zipFiles.includes('applicants.xlsx')
          && resumes.length === Number(withCv.data?.resumeCount || 0),
        {
          empty: [empty.status, empty.data?.error],
          xlsx: [plain.status, plain.data?.filename, xlsx.length],
          phoneRule: picked.map((a) => ({ status: a.status, expectVisible: a.phoneVisible })),
          phoneWrong,
          zip: [withCv.status, withCv.data?.filename, zipFiles],
          resumeCount: withCv.data?.resumeCount,
          skippedResumes: withCv.data?.skippedResumes,
        },
      );
    }
  }

  if (internId) {
    const closure = await apiRequest(BASE, `/api/ip/employer/internships/${internId}/closure-summary`, {
      cookie: emp.cookie,
    });
    assess('TC-IS-09-012', closure.status === 200 && Boolean(closure.data?.summary), {
      status: internships.data?.items?.[0]?.status,
      summary: closure.data?.summary,
    });
  } else {
    fail('TC-IS-09-012', 'No employer posting');
  }

  const lists = await apiRequest(BASE, '/api/ip/employer/lists', { cookie: emp.cookie });
  assess('TC-IS-09-013', lists.status === 200, { status: lists.status, n: (lists.data?.items || []).length });

  // TC-IS-10-001: search → full-page profile on an owned application (fields, phone + contact gating),
  // add a note and a follow-up reminder (removed afterwards); a non-searchable stranger is 404.
  {
    const search = await apiRequest(BASE, '/api/ip/employer/candidates', { cookie: emp.cookie });
    const empEmail = QA_ACCOUNTS.employer.email;
    const { owned, stranger } = await withDb(async (db) => {
      const o = await db.query(
        `SELECT a.id AS app_id, a.candidate_id, a.status, a.internship_id, c.hide_phone_until_shortlist AS hide
           FROM ip_applications a
           JOIN ip_internships i ON i.id = a.internship_id
           JOIN ip_employers e ON e.id = i.employer_id
           JOIN ip_users u ON u.id = e.user_id
           JOIN ip_candidates c ON c.id = a.candidate_id
          WHERE lower(u.email) = lower($1)
          ORDER BY a.created_at DESC LIMIT 1`,
        [empEmail],
      );
      const s = await db.query(
        `SELECT c.id FROM ip_candidates c
          WHERE c.searchable = false
            AND NOT EXISTS (
              SELECT 1 FROM ip_applications a
                JOIN ip_internships i ON i.id = a.internship_id
                JOIN ip_employers e ON e.id = i.employer_id
                JOIN ip_users u ON u.id = e.user_id
               WHERE a.candidate_id = c.id AND lower(u.email) = lower($1))
          LIMIT 1`,
        [empEmail],
      );
      return { owned: o.rows[0], stranger: s.rows[0] };
    });
    if (!owned) {
      blocked('TC-IS-10-001', 'Test employer has no application to open a candidate profile from');
    } else {
      const detail = await apiRequest(
        BASE,
        `/api/ip/employer/candidates/${owned.candidate_id}?applicationId=${encodeURIComponent(owned.app_id)}`,
        { cookie: emp.cookie },
      );
      const c = detail.data?.candidate || {};
      const expectHidden = owned.hide !== false && !employerCanSeeCandidatePhone(owned.status, owned.hide !== false);
      const profileOk = detail.status === 200 && c.id === owned.candidate_id && Boolean(c.name)
        && detail.data?.application?.id === owned.app_id && c.contact_gated === false && Boolean(c.email)
        && c.phone_hidden === expectHidden && (!expectHidden || c.phone == null);

      const noteText = `QA note ${Date.now()}`;
      const note = await apiRequest(BASE, `/api/ip/employer/applications/${owned.app_id}/notes`, {
        method: 'POST', cookie: emp.cookie, body: { body: noteText },
      });
      const emptyNote = await apiRequest(BASE, `/api/ip/employer/applications/${owned.app_id}/notes`, {
        method: 'POST', cookie: emp.cookie, body: { body: '  ' },
      });
      const notes = await apiRequest(BASE, `/api/ip/employer/applications/${owned.app_id}/notes`, { cookie: emp.cookie });
      // GET lists the 50 earliest open reminders, so an early date keeps this one in the list.
      const remindAt = '2000-01-01T09:00:00.000Z';
      const rem = await apiRequest(BASE, '/api/ip/employer/reminders', {
        method: 'POST', cookie: emp.cookie,
        body: { remindAt, applicationId: owned.app_id, internshipId: owned.internship_id, note: 'QA follow-up' },
      });
      const rems = await apiRequest(BASE, '/api/ip/employer/reminders', { cookie: emp.cookie });
      await withDb(async (db) => {
        if (note.data?.id) await db.query(`DELETE FROM ip_application_notes WHERE id = $1`, [note.data.id]);
        if (rem.data?.id) await db.query(`DELETE FROM ip_follow_up_reminders WHERE id = $1`, [rem.data.id]);
      });
      const noteOk = note.status === 201 && emptyNote.status === 400
        && (notes.data?.items || []).some((n) => n.id === note.data?.id && n.body === noteText);
      const remOk = rem.status === 201 && (rems.data?.items || []).some((r) => r.id === rem.data?.id);
      const strangerRes = stranger
        ? await apiRequest(BASE, `/api/ip/employer/candidates/${stranger.id}`, { cookie: emp.cookie })
        : null;
      const strangerOk = !strangerRes || strangerRes.status === 404;
      assess('TC-IS-10-001', search.status === 200 && profileOk && noteOk && remOk && strangerOk, {
        search: search.status,
        profile: {
          status: detail.status,
          applicationStatus: owned.status,
          phoneHidden: c.phone_hidden,
          expectHidden,
          contactGated: c.contact_gated,
        },
        note: { post: note.status, empty: emptyNote.status, listed: noteOk },
        reminder: { post: rem.status, listed: remOk },
        nonSearchableStranger: strangerRes ? strangerRes.status : 'none in DB to probe',
      });
    }
  }

  const stars0 = await apiRequest(BASE, '/api/ip/ratings', {
    method: 'POST',
    cookie: cand.cookie,
    body: { toUserId: emp.session?.user?.id || 'x', stars: 0, internshipId: internId || 'x' },
  });
  const stars6 = await apiRequest(BASE, '/api/ip/ratings', {
    method: 'POST',
    cookie: cand.cookie,
    body: { toUserId: emp.session?.user?.id || 'x', stars: 6, internshipId: internId || 'x' },
  });
  const stars5NoIntern = await apiRequest(BASE, '/api/ip/ratings', {
    method: 'POST',
    cookie: cand.cookie,
    body: { toUserId: emp.session?.user?.id || 'x', stars: 5 },
  });
  assess(
    'TC-IS-11-013',
    stars0.status === 400 && stars6.status === 400 && stars5NoIntern.status === 400,
    {
      stars0: stars0.status,
      stars6: stars6.status,
      stars5NoInternship: stars5NoIntern.status,
      error: stars5NoIntern.data?.error,
      note: '0 and 6 rejected; stars 5 without internshipId rejected (engagement + internship required).',
    },
  );

  const candProfileId =
    prof.data?.profile?.id ||
    prof.data?.candidate?.id ||
    prof.data?.id ||
    prof.data?.candidateId;
  const offerNoApply = internId && candProfileId
    ? await apiRequest(BASE, '/api/ip/offers', {
        method: 'POST',
        cookie: emp.cookie,
        body: { candidateId: candProfileId, internshipId: internId, roleTitle: 'QA no-apply offer' },
      })
    : { status: 0, data: { error: 'missing internId or candidateId' } };
  const coreAlreadyApplied = offerNoApply.status === 409 || offerNoApply.status === 201;
  assess(
    'TC-IS-11-014',
    internId && candProfileId
      ? offerNoApply.status === 400 || coreAlreadyApplied
      : false,
    {
      internId,
      candProfileId,
      status: offerNoApply.status,
      error: offerNoApply.data?.error,
      note: '400 when no application exists. 409/201 means this core pair already applied (fixture overlap) — still proves POST is gated on application_id uniqueness or existing apply, not a silent insert without application.',
    },
  );

  const empOffers = await apiRequest(BASE, '/api/ip/offers', { cookie: emp.cookie });
  // Declined / expired / withdrawn offers may be re-sent (201), so only an accepted or still-open
  // pending offer proves the duplicate guard.
  const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const offerItems = (empOffers.data?.items || []).filter((o) => o.application_id);
  const offerWithApp =
    offerItems.find((o) => String(o.status).toLowerCase() === 'accepted') ||
    offerItems.find(
      (o) => String(o.status).toLowerCase() === 'pending' && (!o.valid_until || String(o.valid_until).slice(0, 10) >= todayIst),
    );
  const dupOffer = offerWithApp?.application_id
    ? await apiRequest(BASE, '/api/ip/offers', {
        method: 'POST',
        cookie: emp.cookie,
        body: { applicationId: offerWithApp.application_id, roleTitle: 'QA duplicate' },
      })
    : { status: 0, data: { error: 'no existing offer with application_id' } };
  assess(
    'TC-IS-11-015',
    offerWithApp ? dupOffer.status === 409 : false,
    {
      applicationId: offerWithApp?.application_id,
      existingOfferStatus: offerWithApp?.status,
      status: dupOffer.status,
      error: dupOffer.data?.error,
    },
  );

  await runNotRunEleven({ BASE, assess, blocked, cand, emp });

  const endorseNoIntern = candProfileId
    ? await apiRequest(BASE, '/api/ip/endorsements', {
        method: 'POST',
        cookie: emp.cookie,
        body: { candidateId: candProfileId, skillsEndorsed: ['QA'] },
      })
    : { status: 0 };
  const ratingAppliedOnly = internId
    ? await apiRequest(BASE, '/api/ip/ratings', {
        method: 'POST',
        cookie: emp.cookie,
        body: { toUserId: cand.session?.user?.id, internshipId: internId, stars: 5, comment: 'QA gate' },
      })
    : { status: 0 };
  const engagedStatus = internId
    ? await withDb(async (db) => (await db.query(
        `SELECT a.status FROM ip_applications a
           JOIN ip_candidates c ON c.id = a.candidate_id
          WHERE a.internship_id = $1 AND c.user_id = $2
          ORDER BY a.created_at DESC LIMIT 1`,
        [internId, cand.session?.user?.id],
      )).rows[0]?.status || 'none')
    : null;
  const engaged = engagedStatus === 'hired' || engagedStatus === 'completed';
  const ratingGateOk = engaged
    ? ratingAppliedOnly.status === 201 || ratingAppliedOnly.status === 409
    : ratingAppliedOnly.status === 400;
  // Always probe one not-yet-hired application of this employer, so the gate is tested whatever internId's status is.
  const notHired = await withDb(async (db) => (await db.query(
    `SELECT a.status, a.internship_id, c.user_id AS cand_uid
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_candidates c ON c.id = a.candidate_id
      WHERE e.user_id = $1 AND a.status NOT IN ('hired', 'completed')
      ORDER BY a.created_at DESC LIMIT 1`,
    [emp.session?.user?.id],
  )).rows[0] || null);
  const notHiredRating = notHired
    ? await apiRequest(BASE, '/api/ip/ratings', {
        method: 'POST',
        cookie: emp.cookie,
        body: { toUserId: notHired.cand_uid, internshipId: notHired.internship_id, stars: 4, comment: 'QA gate' },
      })
    : { status: 0 };
  const notHiredOk = notHiredRating.status === 400 && /only allowed after the candidate is hired/i.test(notHiredRating.data?.error || '');
  assess(
    'TC-IS-11-018',
    endorseNoIntern.status === 400 && Boolean(internId) && ratingGateOk && notHiredOk,
    {
      endorseNoInternshipId: endorseNoIntern.status,
      endorseError: endorseNoIntern.data?.error,
      applicationStatus: engagedStatus,
      ratingWithInternship: ratingAppliedOnly.status,
      ratingError: ratingAppliedOnly.data?.error,
      notHiredApplicationStatus: notHired?.status ?? 'none in DB',
      notHiredRating: [notHiredRating.status, notHiredRating.data?.error],
      note: 'Endorsement without internshipId must 400. Rating a not-yet-hired application must 400 (gate). internId rating: 400 unless hired/completed (then 201, or 409 if already rated).',
    },
  );

  const rateAgain = internId
    ? await apiRequest(BASE, '/api/ip/ratings', {
        method: 'POST',
        cookie: emp.cookie,
        body: { toUserId: cand.session?.user?.id, internshipId: internId, stars: 5, comment: 'QA dup' },
      })
    : { status: 0 };
  assess(
    'TC-IS-11-019',
    rateAgain.status === 409 || rateAgain.status === 400,
    {
      status: rateAgain.status,
      error: rateAgain.data?.error,
      note: '409 unique (from,to,internship). 400 if this pair is not hired/completed yet (gate before unique).',
    },
  );

  const end1 = internId && candProfileId
    ? await apiRequest(BASE, '/api/ip/endorsements', {
        method: 'POST',
        cookie: emp.cookie,
        body: { candidateId: candProfileId, internshipId: internId, skillsEndorsed: ['QA'] },
      })
    : { status: 0 };
  const end2 = internId && candProfileId
    ? await apiRequest(BASE, '/api/ip/endorsements', {
        method: 'POST',
        cookie: emp.cookie,
        body: { candidateId: candProfileId, internshipId: internId, skillsEndorsed: ['QA'] },
      })
    : { status: 0 };
  assess(
    'TC-IS-11-020',
    (end1.status === 201 || end1.status === 409 || end1.status === 400)
      && (end2.status === 409 || end2.status === 400 || (end1.status === 201 && end2.status === 409)),
    {
      first: end1.status,
      second: end2.status,
      e1: end1.data?.error,
      e2: end2.data?.error,
      note: 'Duplicate 409 after a successful 201. 400 if not hired/completed. 409 on first means unique already held.',
    },
  );

  const notif = await apiRequest(BASE, '/api/ip/notifications', { cookie: cand.cookie });
  const notifItems = notif.data?.items || [];
  const annotated = notifItems.every((n) => typeof n.resourceUnavailable === 'boolean' || n.resourceUnavailable == null);
  assess(
    'TC-IS-12-008',
    notif.status === 200 && annotated,
    {
      n: notifItems.length,
      deadCount: notifItems.filter((n) => n.resourceUnavailable).length,
      sampleKeys: notifItems[0] ? Object.keys(notifItems[0]) : [],
      note: 'annotateNotificationsTargetAvailability should attach resourceUnavailable. Dead-link UI needs a deleted internship/offer fixture.',
    },
  );

  const threadList = await apiRequest(BASE, '/api/ip/messages/threads', { cookie: cand.cookie });
  const threadItems = threadList.data?.items || threadList.data?.threads || [];
  const hasAppKey = threadItems.length === 0
    || threadItems.every((t) => Object.prototype.hasOwnProperty.call(t, 'application_id') || Object.prototype.hasOwnProperty.call(t, 'applicationId'));
  assess(
    'TC-IS-12-009',
    threadList.status === 200 && hasAppKey,
    {
      n: threadItems.length,
      sample: threadItems[0]
        ? { id: threadItems[0].id, application_id: threadItems[0].application_id ?? threadItems[0].applicationId }
        : null,
    },
  );

  // TC-IS-13-004: items are newest-first; every balance_after equals the sum of deltas up to that row,
  // and the header balance equals the profile points. Seeded test accounts get their opening points
  // outside the ledger, so balance = ledger sum is checked on every account created through sign-up.
  {
    const bal = Number(ledger.data?.balance);
    const items = ledger.data?.items || [];
    const chronological = items.slice().reverse();
    let running = 0;
    const brokenRows = [];
    for (const row of chronological) {
      running += Number(row.delta) || 0;
      if (Number(row.balance_after) !== running) brokenRows.push({ id: row.id, reason: row.reason, balance_after: row.balance_after, expected: running });
    }
    const profilePoints = Number(prof.data?.profile?.points ?? prof.data?.points);
    const signup = await withDb(async (db) => (await db.query(
      `SELECT u.email, u.points::int AS points, s.total::int AS ledger_sum
       FROM ip_users u
       JOIN (SELECT user_id, sum(delta) AS total FROM ip_points_ledger GROUP BY 1) s ON s.user_id = u.id
       WHERE EXISTS (SELECT 1 FROM ip_points_ledger l WHERE l.user_id = u.id AND l.reason = 'default_signup')`,
    )).rows);
    const mismatched = signup.filter((u) => u.points !== u.ledger_sum);
    assess(
      'TC-IS-13-004',
      ledger.status === 200 && items.length > 0 && !brokenRows.length && profilePoints === bal
        && signup.length > 0 && !mismatched.length,
      {
        testCandidate: { balance: bal, profilePoints, rows: items.length, brokenRows: brokenRows.slice(0, 5) },
        signupAccounts: signup.length,
        balanceNotLedgerSum: mismatched.slice(0, 5).map((u) => ({ points: u.points, ledgerSum: u.ledger_sum })),
      },
    );
  }

  const ideas = await apiRequest(BASE, '/api/ip/ideas', { cookie: cand.cookie });
  assess('TC-IS-15-006', ideas.status === 200 && Array.isArray(ideas.data?.items), {
    status: ideas.status,
    n: (ideas.data?.items || []).length,
    note: 'Sort most_voted/newest/recently_updated is client-side on /ideas; API returns vote_count DESC.',
  });

  const tk = `qa.remaining.${Date.now()}`;
  const putPrefs = await apiRequest(BASE, '/api/ip/table-filter-prefs', {
    method: 'PUT',
    cookie: cand.cookie,
    body: { tableKey: tk, filters: { minMatch: 1 }, sort: 'newest' },
  });
  const getPrefs = await apiRequest(BASE, `/api/ip/table-filter-prefs?tableKey=${encodeURIComponent(tk)}`, {
    cookie: cand.cookie,
  });
  assess(
    'TC-IS-16-001',
    putPrefs.status === 200 && getPrefs.status === 200 && Number(getPrefs.data?.filters?.minMatch) === 1,
    { put: putPrefs.status, got: getPrefs.data },
  );

  const p1 = await apiRequest(BASE, '/api/ip/list-presets', {
    method: 'POST',
    cookie: cand.cookie,
    body: { tableKey: tk, name: 'QA default', filters: { a: 1 }, isDefault: true },
  });
  const p2 = await apiRequest(BASE, '/api/ip/list-presets', {
    method: 'POST',
    cookie: cand.cookie,
    body: { tableKey: tk, name: 'QA second', filters: { a: 2 }, isDefault: true },
  });
  const listed = await apiRequest(BASE, `/api/ip/list-presets?tableKey=${encodeURIComponent(tk)}`, {
    cookie: cand.cookie,
  });
  const defaults = (listed.data?.items || []).filter((x) => x.is_default);
  assess(
    'TC-IS-16-002',
    p1.status < 300 && p2.status < 300 && defaults.length === 1,
    { p1: p1.status, p2: p2.status, defaults: defaults.length, items: (listed.data?.items || []).length },
  );

  const extraIds = [];
  for (let i = 0; i < 4; i += 1) {
    const extra = await apiRequest(BASE, '/api/ip/list-presets', {
      method: 'POST',
      cookie: cand.cookie,
      body: { tableKey: tk, name: `QA extra ${i}`, filters: {} },
    });
    if (extra.data?.id) extraIds.push(extra.data.id);
  }
  const sixth = await apiRequest(BASE, '/api/ip/list-presets', {
    method: 'POST',
    cookie: cand.cookie,
    body: { tableKey: tk, name: 'QA sixth', filters: {} },
  });
  assess(
    'TC-IS-16-003',
    sixth.status === 400 && /5 saved views/i.test(String(sixth.data?.error || '')),
    { status: sixth.status, error: sixth.data?.error },
  );

  const dup = await apiRequest(BASE, '/api/ip/list-presets', {
    method: 'POST',
    cookie: cand.cookie,
    body: { tableKey: tk, name: 'QA default', filters: {} },
  });
  const otherKey = await apiRequest(BASE, '/api/ip/list-presets', {
    method: 'POST',
    cookie: cand.cookie,
    body: { tableKey: `${tk}.other`, name: 'QA default', filters: {} },
  });
  assess(
    'TC-IS-16-004',
    dup.status >= 400 && otherKey.status < 300,
    { dup: dup.status, other: otherKey.status, otherId: otherKey.data?.id },
  );

  const anonPrefs = await apiRequest(BASE, `/api/ip/table-filter-prefs?tableKey=${encodeURIComponent(tk)}`);
  const anonPresets = await apiRequest(BASE, `/api/ip/list-presets?tableKey=${encodeURIComponent(tk)}`);
  const saPrefs = await apiRequest(BASE, `/api/ip/table-filter-prefs?tableKey=${encodeURIComponent(tk)}`, {
    cookie: sa.cookie,
  });
  const saPresets = await apiRequest(BASE, `/api/ip/list-presets?tableKey=${encodeURIComponent(tk)}`, {
    cookie: sa.cookie,
  });
  assess(
    'TC-IS-16-005',
    [anonPrefs.status, anonPresets.status, saPrefs.status, saPresets.status].every((s) => s === 401 || s === 403),
    {
      anonPrefs: anonPrefs.status,
      anonPresets: anonPresets.status,
      saPrefs: saPrefs.status,
      saPresets: saPresets.status,
    },
  );

  const applyList = listed.data?.items || [];
  const toDelete = applyList[0]?.id;
  if (toDelete) {
    const del = await apiRequest(BASE, `/api/ip/list-presets?id=${encodeURIComponent(toDelete)}`, {
      method: 'DELETE',
      cookie: cand.cookie,
    });
    assess('TC-IS-16-006', del.status === 200, { deleted: toDelete, status: del.status });
  } else {
    fail('TC-IS-16-006', 'No preset id to delete');
  }

  if (internId) {
    const views = await apiRequest(BASE, `/api/ip/employer/saved-views?internshipId=${encodeURIComponent(internId)}`, {
      cookie: emp.cookie,
    });
    assess('TC-IS-16-007', views.status === 200, { internId, n: (views.data?.items || []).length });
  } else {
    fail('TC-IS-16-007', 'No posting for per-internship tableKey');
  }

  const threads = await apiRequest(BASE, '/api/ip/messages/threads', { cookie: cand.cookie });
  const threadId = (threads.data?.items || threads.data?.threads || [])[0]?.id;
  // TC-IS-17-004: both participants pass the file gate for this thread's attachment folder (missing
  // object → 404, not 403); a signed-in non-participant is refused (403) and cannot upload (404).
  // Probes a key that does not exist, so no file is written to storage.
  if (threadId) {
    const outsider = await apiLogin(BASE, QA_ACCOUNTS.employerPending.email, QA_ACCOUNTS.employerPending.password);
    const key = encodeURIComponent(`internship-portal/messages/${threadId}/qa-missing-${Date.now()}.pdf`);
    const fileStatus = async (cookie) => (await fetch(`${BASE}/api/ip/files?key=${key}`, { headers: { Cookie: cookie } })).status;
    const upload = async (cookie) => (await fetch(`${BASE}/api/ip/messages/threads/${threadId}/attachment`, {
      method: 'POST', headers: { Cookie: cookie },
    })).status;
    const r = {
      threadId,
      candidateGet: await fileStatus(cand.cookie),
      employerGet: await fileStatus(emp.cookie),
      outsiderGet: outsider.ok ? await fileStatus(outsider.cookie) : 'not signed in',
      candidateEmptyUpload: await upload(cand.cookie),
      outsiderUpload: outsider.ok ? await upload(outsider.cookie) : 'not signed in',
    };
    if (!outsider.ok) {
      blocked('TC-IS-17-004', `Non-participant test employer cannot sign in — run npm run qa:ensure-test-accounts. ${JSON.stringify(r)}`);
    } else {
      assess(
        'TC-IS-17-004',
        r.candidateGet === 404 && r.employerGet === 404 && r.outsiderGet === 403
          && (r.candidateEmptyUpload === 400 || r.candidateEmptyUpload === 503) && r.outsiderUpload === 404,
        r,
      );
    }
  } else {
    blocked('TC-IS-17-004', 'No message thread for the test candidate');
  }

  const cities = await apiRequest(BASE, '/api/ip/ref/cities', { cookie: cand.cookie });
  const degrees = await apiRequest(BASE, '/api/ip/ref/degrees', { cookie: cand.cookie });
  assess(
    'TC-IS-18-036',
    cities.status === 200 && degrees.status === 200,
    { cities: (cities.data?.items || cities.data || []).length, degrees: (degrees.data?.items || degrees.data || []).length },
  );

  const cronA = await apiRequest(BASE, '/api/ip/cron/schedule-reminders', { cookie: cand.cookie, method: 'POST', body: {} });
  const cronB = await apiRequest(BASE, '/api/ip/cron/export-jobs', { cookie: cand.cookie, method: 'POST', body: {} });
  assess(
    'TC-IS-18-038',
    [cronA.status, cronB.status].every((s) => s === 401 || s === 403 || s === 405),
    { schedule: cronA.status, exportJobs: cronB.status },
  );

  console.log('Latest-update TC-IS cases (Google / help / ops / migration)…');
  try {
    await runLatestUpdateTcIsCases({ BASE, assess, pass, fail, blocked });
  } catch (e) {
    console.warn('Latest-update suite error (continuing):', e?.message || e);
    blocked('TC-IS-02-024', `Latest-update aborted: ${e?.message || e}`);
  }
  // cleanup leftover presets on this tableKey
  const leftover = await apiRequest(BASE, `/api/ip/list-presets?tableKey=${encodeURIComponent(tk)}`, {
    cookie: cand.cookie,
  });
  for (const row of leftover.data?.items || []) {
    await apiRequest(BASE, `/api/ip/list-presets?id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      cookie: cand.cookie,
    });
  }
  if (otherKey.data?.id) {
    await apiRequest(BASE, `/api/ip/list-presets?id=${encodeURIComponent(otherKey.data.id)}`, {
      method: 'DELETE',
      cookie: cand.cookie,
    });
  }
  for (const id of extraIds) {
    await apiRequest(BASE, `/api/ip/list-presets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      cookie: cand.cookie,
    });
  }

  const n = Object.keys(byTcId).length;
  const passN = Object.values(byTcId).filter((c) => c.status === 'Pass').length;
  const failN = Object.values(byTcId).filter((c) => c.status === 'Fail').length;
  const blockedN = Object.values(byTcId).filter((c) => c.status === 'Blocked').length;
  console.log(JSON.stringify({ tcIs: n, pass: passN, fail: failN, blocked: blockedN }));
  return { byTcId, executedAt, base: BASE };
}

/** Run one TC-IS-* case by id (for --only TC-IS-12-010 etc.). */
export async function runSingleTcIsCase(tcId, opts = {}) {
  const BASE = opts.base || process.env.IP_BASE || 'http://localhost:3000';
  const byTcId = {};
  const executedAt = new Date().toISOString();

  function pass(id, actual) {
    byTcId[id] = { status: 'Pass', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function fail(id, actual) {
    byTcId[id] = { status: 'Fail', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function blocked(id, actual) {
    byTcId[id] = { status: 'Blocked', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
  }
  function assess(id, ok, actual) {
    (ok ? pass : fail)(id, actual);
  }

  await ensureCoreQaAccountsReady().catch((e) => console.warn('ensureCoreQaAccountsReady:', e.message || e));

  const cand = await apiLogin(BASE, QA_ACCOUNTS.candidate.email, QA_ACCOUNTS.candidate.password);
  if (!cand.ok && tcId === 'TC-IS-06-006') {
    throw new Error('Candidate login failed for TC-IS-06-006');
  }

  if (tcId === 'TC-IS-12-010') {
    await runTcIs12010({ BASE, assess, blocked });
  } else if (tcId === 'TC-IS-06-006') {
    await runTcIs06006({ BASE, assess, blocked, cand });
  } else if (tcId === 'TC-IS-02-023') {
    await runTcIs02023({ BASE, assess, blocked });
  } else {
    throw new Error(`Unknown TC-IS case for --only: ${tcId}`);
  }

  const rec = byTcId[tcId];
  console.log(JSON.stringify({ tcId, ...(rec || { status: 'Not Run' }) }));
  return { byTcId, executedAt, base: BASE };
}
