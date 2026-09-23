import JSZip from 'jszip';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { applicationsToCsv } from '@/lib/ipMcqAnalytics';
import { getIpObject, isS3Configured } from '@/lib/s3';
import { shouldUseBackgroundJob, SYNC_EXPORT_THRESHOLD } from '@/lib/ipApplicantExportPolicy';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';
import { experienceExportText } from '@/lib/ipCandidateExperience';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';

export { shouldUseBackgroundJob, SYNC_EXPORT_THRESHOLD };

function safeName(name) {
  return String(name || 'candidate')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
}

/** Block SSRF targets: localhost, private/link-local/metadata IPs, non-http(s). */
function isSafePublicHttpUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost'
    || host === 'metadata.google.internal'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
  ) {
    return false;
  }
  // IPv4 literals
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some((n) => n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
  }
  // IPv6 literals (block loopback / link-local / ULA)
  if (host.includes(':')) {
    if (
      host === '::1'
      || host.startsWith('fc')
      || host.startsWith('fd')
      || host.startsWith('fe80')
      || host === '::'
    ) {
      return false;
    }
  }
  return true;
}

async function fetchResumeBuffer(resumeUrl) {
  if (!resumeUrl) return null;
  const url = String(resumeUrl);
  try {
    if (url.includes('/api/ip/files?key=')) {
      const key = decodeURIComponent(url.split('key=')[1].split('&')[0]);
      if (!isS3Configured()) return null;
      const obj = await getIpObject(key);
      const bytes = await obj.Body?.transformToByteArray?.();
      if (!bytes) return null;
      const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')) : '.pdf';
      return { buffer: Buffer.from(bytes), ext };
    }
    if (/^https?:\/\//i.test(url)) {
      if (!isSafePublicHttpUrl(url)) return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          redirect: 'error',
        });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || '';
        const ext = ct.includes('pdf') ? '.pdf' : ct.includes('word') ? '.docx' : '.bin';
        return { buffer: buf, ext };
      } finally {
        clearTimeout(t);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadAppsForExport(employerId, internshipId, applicationIds) {
  const result = await query(
    `SELECT a.id, a.status, a.match_score, a.screening_disabled, a.created_at,
            c.name, c.email, c.college, c.degree, c.specialization, c.study_status,
            c.graduation_year, c.cgpa, c.city, c.state, c.country, c.skills, c.resume_url,
            c.preferred_work_mode, c.preferred_hours_start, c.preferred_hours_end,
            c.availability_date, c.prior_experience, c.immediate_start, c.willing_to_relocate,
            c.ongoing_commitment, c.linkedin_url, c.github_url, c.portfolio_url,
            c.has_wired_broadband, c.has_dedicated_laptop,
            c.hide_phone_until_shortlist, c.phone
     FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.internship_id = $2 AND a.id = ANY($3::text[])
     ORDER BY a.created_at ASC`,
    [employerId, internshipId, applicationIds],
  );
  return result.rows.map((row) => {
    const hide = row.hide_phone_until_shortlist !== false;
    const revealPhone = employerCanSeeCandidatePhone(row.status, hide);
    return {
      ...row,
      phone: revealPhone ? row.phone : '',
    };
  });
}

/** Keep IDs that still exist on this internship; report the rest (deleted/stale). */
export async function partitionExportApplicationIds(employerId, internshipId, applicationIds) {
  const wanted = [...new Set((applicationIds || []).map(String).filter(Boolean))];
  if (!wanted.length) return { liveIds: [], skippedIds: [] };
  const live = await query(
    `SELECT a.id FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.internship_id = $2 AND a.id = ANY($3::text[])`,
    [employerId, internshipId, wanted],
  );
  const liveSet = new Set(live.rows.map((r) => r.id));
  return {
    liveIds: wanted.filter((id) => liveSet.has(id)),
    skippedIds: wanted.filter((id) => !liveSet.has(id)),
  };
}

function applicantSheetRows(rows) {
  const yn = (v) => (v == null || v === '' ? '' : v ? 'yes' : 'no');
  return (rows || []).map((r) => ({
    application_id: r.id || '',
    candidate_name: r.name || '',
    email: r.email || '',
    phone: r.phone || '',
    college: r.college || '',
    degree: r.degree || '',
    specialization: r.specialization || '',
    study_status: r.study_status || '',
    graduation_year: r.graduation_year ?? '',
    cgpa: r.cgpa ?? '',
    city: r.city || '',
    state: r.state || '',
    country: r.country || '',
    skills: Array.isArray(r.skills) ? r.skills.join('; ') : r.skills || '',
    preferred_work_mode: r.preferred_work_mode || '',
    preferred_hours_start: r.preferred_hours_start || '',
    preferred_hours_end: r.preferred_hours_end || '',
    availability_date: r.availability_date || '',
    prior_experience: experienceExportText(r.prior_experience) || r.prior_experience || '',
    immediate_start: yn(r.immediate_start),
    willing_to_relocate: yn(r.willing_to_relocate),
    ongoing_commitment: r.ongoing_commitment || '',
    linkedin_url: r.linkedin_url || '',
    github_url: r.github_url || '',
    portfolio_url: r.portfolio_url || '',
    has_wired_broadband: yn(r.has_wired_broadband),
    has_dedicated_laptop: yn(r.has_dedicated_laptop),
    match_score: r.match_score ?? '',
    status: r.status || '',
    screening_disabled: r.screening_disabled ? 'yes' : 'no',
    resume_included: r.resume_url ? 'yes' : 'no',
    created_at: r.created_at || '',
  }));
}

/**
 * Build XLSX (+ optional ZIP of resumes the employer is allowed to see).
 * Phone-hidden rules: still allow resume if URL present (resume is already on applicant row).
 * `csv` kept for legacy job clients; prefer `xlsxBase64` / zip with applicants.xlsx.
 */
export async function buildApplicantExportPackage(rows, { includeResumes = false, onProgress } = {}) {
  const csv = applicationsToCsv(rows);
  const sheetRows = applicantSheetRows(rows);
  const xlsxBuffer = await workbookToBuffer([
    {
      name: 'Applicants',
      rows: sheetRows.length
        ? sheetRows
        : [{ application_id: '', candidate_name: '', email: '', phone: '', status: '' }],
    },
  ]);
  const xlsxBase64 = xlsxBuffer.toString('base64');
  let zipBase64 = null;
  let resumeCount = 0;
  let skipped = 0;
  let filename = 'applicants-export.xlsx';

  if (includeResumes) {
    const zip = new JSZip();
    zip.file('applicants.xlsx', xlsxBuffer);
    zip.file(
      'README.txt',
      'InternSafar applicant export.\napplicants.xlsx = full profile fields the employer is allowed to see.\nresumes/ = CV files when available.\nPhone is included only when shortlist/privacy rules allow.\n',
    );
    let i = 0;
    for (const row of rows) {
      i += 1;
      if (typeof onProgress === 'function') onProgress(i, rows.length);
      if (!row.resume_url) {
        skipped += 1;
        continue;
      }
      const file = await fetchResumeBuffer(row.resume_url);
      if (!file) {
        skipped += 1;
        continue;
      }
      resumeCount += 1;
      zip.file(`resumes/${safeName(row.name)}_${String(row.id || '').slice(-6)}${file.ext}`, file.buffer);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    zipBase64 = buf.toString('base64');
    filename = 'applicants-export.zip';
  }

  return { csv, xlsxBase64, zipBase64, filename, resumeCount, skipped };
}

export async function createExportJob({
  employerId,
  internshipId,
  userId,
  applicationIds,
  includeResumes,
}) {
  const id = newId('ip_exp');
  await query(
    `INSERT INTO ip_export_jobs (
       id, employer_id, internship_id, created_by_user_id, status,
       include_resumes, application_ids, total, progress
     ) VALUES ($1,$2,$3,$4,'pending',$5,$6::jsonb,$7,0)`,
    [
      id,
      employerId,
      internshipId,
      userId,
      Boolean(includeResumes),
      JSON.stringify(applicationIds),
      applicationIds.length,
    ],
  );
  return id;
}

export async function processExportJob(jobId) {
  const jobRes = await query(`SELECT * FROM ip_export_jobs WHERE id = $1`, [jobId]);
  const job = jobRes.rows[0];
  if (!job) return null;
  if (job.status === 'done') return job;

  await query(
    `UPDATE ip_export_jobs SET status = 'processing', updated_at = now() WHERE id = $1`,
    [jobId],
  );

  try {
    const ids = Array.isArray(job.application_ids) ? job.application_ids : JSON.parse(job.application_ids || '[]');
    const { liveIds, skippedIds } = await partitionExportApplicationIds(
      job.employer_id,
      job.internship_id,
      ids,
    );
    const rows = await loadAppsForExport(job.employer_id, job.internship_id, liveIds);
    const pack = await buildApplicantExportPackage(rows, {
      includeResumes: job.include_resumes,
      onProgress: async (done, total) => {
        await query(
          `UPDATE ip_export_jobs SET progress = $2, total = $3, updated_at = now() WHERE id = $1`,
          [jobId, done, total],
        );
      },
    });

    const skipNote = skippedIds.length
      ? `Skipped ${skippedIds.length} application(s) that no longer exist.`
      : null;

    await query(
      `UPDATE ip_export_jobs SET
         status = 'done', progress = total, result_csv = $2, result_zip_base64 = $3,
         result_filename = $4, resume_count = $5, skipped_resumes = $6,
         skipped_application_ids = $7::jsonb, error = $8,
         completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [
        jobId,
        // When no zip: store xlsx as base64 in result_csv (UI checks .xlsx filename).
        pack.zipBase64 ? pack.csv : (pack.xlsxBase64 || pack.csv),
        pack.zipBase64,
        pack.filename,
        pack.resumeCount,
        pack.skipped,
        JSON.stringify(skippedIds),
        skipNote,
      ],
    );

    if (liveIds[0]) {
      await query(
        `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
         VALUES ($1,$2,$3,'export',$4::jsonb)`,
        [
          newId('ip_aev'),
          liveIds[0],
          job.created_by_user_id,
          JSON.stringify({
            jobId,
            count: liveIds.length,
            skippedApplicationIds: skippedIds,
            includeResumes: job.include_resumes,
            resumeCount: pack.resumeCount,
          }),
        ],
      );
    }

    const done = await query(`SELECT * FROM ip_export_jobs WHERE id = $1`, [jobId]);
    return done.rows[0];
  } catch (e) {
    await query(
      `UPDATE ip_export_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [jobId, e.message || String(e)],
    );
    throw e;
  }
}
