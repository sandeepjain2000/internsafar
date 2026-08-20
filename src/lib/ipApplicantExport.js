import JSZip from 'jszip';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { applicationsToCsv } from '@/lib/ipMcqAnalytics';
import { getIpObject, isS3Configured } from '@/lib/s3';
import { shouldUseBackgroundJob, SYNC_EXPORT_THRESHOLD } from '@/lib/ipApplicantExportPolicy';

export { shouldUseBackgroundJob, SYNC_EXPORT_THRESHOLD };

function safeName(name) {
  return String(name || 'candidate')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
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
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
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
            c.name, c.email, c.college, c.degree, c.city, c.skills, c.resume_url,
            c.hide_phone_until_shortlist, c.phone
     FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.internship_id = $2 AND a.id = ANY($3::text[])
     ORDER BY a.created_at ASC`,
    [employerId, internshipId, applicationIds],
  );
  return result.rows;
}

/**
 * Build CSV (+ optional ZIP of resumes the employer is allowed to see).
 * Phone-hidden rules: still allow resume if URL present (resume is already on applicant row).
 */
export async function buildApplicantExportPackage(rows, { includeResumes = false, onProgress } = {}) {
  const csv = applicationsToCsv(rows);
  let zipBase64 = null;
  let resumeCount = 0;
  let skipped = 0;
  let filename = 'applicants-export.csv';

  if (includeResumes) {
    const zip = new JSZip();
    zip.file('applicants.csv', csv);
    zip.file(
      'README.txt',
      'InternSafar applicant export.\nCSV contains authorized screening fields.\nresumes/ contains downloaded CVs when available.\nHidden phone numbers are not included.\n',
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
      zip.file(`resumes/${safeName(row.name)}_${row.id.slice(-6)}${file.ext}`, file.buffer);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    zipBase64 = buf.toString('base64');
    filename = 'applicants-export.zip';
  }

  return { csv, zipBase64, filename, resumeCount, skipped };
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
    const rows = await loadAppsForExport(job.employer_id, job.internship_id, ids);
    const pack = await buildApplicantExportPackage(rows, {
      includeResumes: job.include_resumes,
      onProgress: async (done, total) => {
        await query(
          `UPDATE ip_export_jobs SET progress = $2, total = $3, updated_at = now() WHERE id = $1`,
          [jobId, done, total],
        );
      },
    });

    await query(
      `UPDATE ip_export_jobs SET
         status = 'done', progress = total, result_csv = $2, result_zip_base64 = $3,
         result_filename = $4, resume_count = $5, skipped_resumes = $6,
         completed_at = now(), updated_at = now(), error = NULL
       WHERE id = $1`,
      [
        jobId,
        pack.csv,
        pack.zipBase64,
        pack.filename,
        pack.resumeCount,
        pack.skipped,
      ],
    );

    await query(
      `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
       VALUES ($1,$2,$3,'export',$4::jsonb)`,
      [
        newId('ip_aev'),
        ids[0],
        job.created_by_user_id,
        JSON.stringify({
          jobId,
          count: ids.length,
          includeResumes: job.include_resumes,
          resumeCount: pack.resumeCount,
        }),
      ],
    );

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
