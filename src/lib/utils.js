import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names (shadcn `cn`). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function statusBadgeClass(tone) {
  const t = String(tone || 'gray').toLowerCase();
  const map = {
    gray: 'badge-status-gray',
    blue: 'badge-status-blue',
    indigo: 'badge-status-indigo',
    green: 'badge-status-green',
    amber: 'badge-status-amber',
    red: 'badge-status-red',
  };
  return map[t] || map.gray;
}

export function getStatusColor(status) {
  const key = String(status || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  const colors = {
    applied: 'blue',
    reviewed: 'indigo',
    shortlisted: 'indigo',
    interviewing: 'indigo',
    offered: 'green',
    hired: 'green',
    declined_offer: 'gray',
    selected: 'green',
    withdrawn: 'gray',
    rejected: 'red',
    draft: 'gray',
    pending: 'amber',
    pending_verification: 'amber',
    removed: 'red',
    pending_moderation: 'amber',
    submitted: 'amber',
    approved: 'green',
    live: 'green',
    published: 'green',
    closed: 'red',
    archived: 'gray',
    open: 'blue',
    under_review: 'indigo',
    resolved: 'green',
    completed: 'green',
    ongoing: 'indigo',
    not_started: 'gray',
    verified: 'green',
    unverified: 'amber',
    invited: 'blue',
    active: 'green',
    inactive: 'gray',
    info: 'blue',
    warning: 'amber',
    success: 'green',
    error: 'red',
  };
  return colors[key] || 'gray';
}

export function formatStatus(status) {
  if (!status) return '';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCurrency(amount, currency = 'INR') {
  if (amount == null || amount === '') return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Fixed + variable CTC / stipend range label for listings */
export function formatCompensationBreakdown(job) {
  if (!job) return '—';
  const period = job.opportunityType === 'job' ? 'yr' : 'mo';
  const fMin = Number(job.fixedPayMin ?? job.stipend);
  const fMax = Number(job.fixedPayMax ?? job.stipend);
  const vMin = Number(job.variablePayMin ?? 0);
  const vMax = Number(job.variablePayMax ?? 0);
  const fixed =
    fMin === fMax
      ? formatCurrency(fMin)
      : `${formatCurrency(fMin)} – ${formatCurrency(fMax)}`;
  const variable =
    vMax > 0
      ? vMin === vMax
        ? formatCurrency(vMin)
        : `${formatCurrency(vMin)} – ${formatCurrency(vMax)}`
      : null;
  if (!variable) return `${fixed}/${period} fixed`;
  return `${fixed}/${period} fixed · ${variable}/${period} variable`;
}
