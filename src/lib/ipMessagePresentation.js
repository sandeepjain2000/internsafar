/** Thread list / inbox labels from live application + offer rows. */

export function threadActionStatus(applicationStatus, archived) {
  if (archived) return { key: 'archived', label: 'Archived', tone: 'muted' };
  const s = String(applicationStatus || '').toLowerCase();
  if (s === 'interviewing') return { key: 'interview', label: 'Interview scheduled', tone: 'interview' };
  if (s === 'offered') return { key: 'offer', label: 'Offer received', tone: 'offer' };
  if (s === 'hired') return { key: 'hired', label: 'Hired', tone: 'offer' };
  if (s === 'completed') return { key: 'completed', label: 'Completed', tone: 'muted' };
  if (s === 'rejected') return { key: 'rejected', label: 'Rejected', tone: 'muted' };
  if (s === 'withdrawn') return { key: 'withdrawn', label: 'Withdrawn', tone: 'muted' };
  if (s === 'declined_offer') return { key: 'declined', label: 'Offer declined', tone: 'muted' };
  return { key: 'waiting', label: 'Waiting for employer', tone: 'waiting' };
}

export function threadNeedsAction(applicationStatus) {
  const s = String(applicationStatus || '').toLowerCase();
  return s === 'interviewing' || s === 'offered';
}

export function formatStipendInr(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN')}/mo`;
}

export function formatDurationMonths(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? '1 month' : `${n} months`;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function lastMessagePreview(body, attachmentName) {
  const text = String(body || '').trim();
  if (text) return text;
  if (attachmentName) return attachmentName;
  return '';
}

export function decorateMessageThread(row) {
  const archived = Boolean(row.archived);
  const action = threadActionStatus(row.application_status, archived);
  return {
    ...row,
    employer_verified: String(row.employer_approval_status || '').toLowerCase() === 'approved',
    action_status: action.label,
    action_key: action.key,
    action_tone: action.tone,
    needs_action: !archived && threadNeedsAction(row.application_status),
  };
}

const ATTACH_PREFIX = '/api/ip/files?key=internship-portal/messages/';

export function isAllowedMessageAttachmentUrl(url) {
  return String(url || '').startsWith(ATTACH_PREFIX);
}
