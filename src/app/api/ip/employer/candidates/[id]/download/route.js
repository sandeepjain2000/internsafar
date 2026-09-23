import { requireSession, jsonError } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';
import { buildEmployerCandidateExportSheets } from '@/lib/ipCandidateFullExport';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';
import JSZip from 'jszip';
import { getIpObject, isS3Configured } from '@/lib/s3';

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
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
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

/**
 * Download one candidate as XLSX (or ZIP with XLSX + CV) for an employer who has an application.
 * GET /api/ip/employer/candidates/[id]/download?applicationId=…
 */
export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();

  const { id } = await params;
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const employerId = emp.rows[0]?.id;
  if (!employerId) return jsonError('Not found', 404);

  let appRow = null;
  if (applicationId) {
    const app = await query(
      `SELECT a.id, a.status, a.created_at, c.name, c.resume_url, c.hide_phone_until_shortlist, c.phone
       FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE a.id = $1 AND a.candidate_id = $2 AND i.employer_id = $3`,
      [applicationId, id, employerId],
    );
    appRow = app.rows[0] || null;
  }
  if (!appRow) {
    const any = await query(
      `SELECT a.id, a.status, a.created_at, c.name, c.resume_url, c.hide_phone_until_shortlist, c.phone
       FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE a.candidate_id = $1 AND i.employer_id = $2
       ORDER BY a.created_at DESC LIMIT 1`,
      [id, employerId],
    );
    appRow = any.rows[0] || null;
  }
  if (!appRow) {
    return jsonError('Download requires an application with your company', 403);
  }

  const hide = appRow.hide_phone_until_shortlist !== false;
  const includePhone = employerCanSeeCandidatePhone(appRow.status, hide);
  const sheets = await buildEmployerCandidateExportSheets(id, employerId, { includePhone });
  const xlsxBuffer = await workbookToBuffer(sheets);

  const resume = await fetchResumeBuffer(appRow.resume_url);
  if (resume) {
    const zip = new JSZip();
    zip.file('candidate.xlsx', xlsxBuffer);
    zip.file(
      `resumes/${safeName(appRow.name)}_${String(appRow.id || '').slice(-6)}${resume.ext}`,
      resume.buffer,
    );
    zip.file(
      'README.txt',
      'InternSafar candidate export.\ncandidate.xlsx = profile sheets the employer may see.\nresumes/ = CV file when available.\nPhone is included only when shortlist/privacy rules allow.\n',
    );
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="candidate-export.zip"',
      },
    });
  }

  return new Response(xlsxBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="candidate-export.xlsx"',
    },
  });
}
