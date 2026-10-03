/** Client-side helpers for the SuperAdmin Candidates list + detail pages. */

const DAY_MS = 24 * 60 * 60 * 1000;

export const APPLICATION_STATUSES = [
  'applied',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'completed',
  'rejected',
  'declined_offer',
  'withdrawn',
];

export const IN_PROGRESS_STATUSES = ['applied', 'shortlisted', 'interviewing', 'offered'];

export const STATUS_LABEL = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interviewing: 'Interviewing',
  offered: 'Offered',
  hired: 'Hired',
  completed: 'Completed',
  rejected: 'Rejected',
  declined_offer: 'Declined offer',
  withdrawn: 'Withdrawn',
  reapplied: 'Reapplied',
  offer_sent: 'Offer sent',
  offer_accepted: 'Offer accepted',
  offer_declined: 'Offer declined',
  message: 'Message sent',
};

export const STATUS_TONE = {
  applied: 'slate',
  shortlisted: 'indigo',
  interviewing: 'blue',
  offered: 'amber',
  hired: 'green',
  completed: 'green',
  rejected: 'rose',
  declined_offer: 'rose',
  withdrawn: 'slate',
  reapplied: 'indigo',
  offer_sent: 'amber',
  offer_accepted: 'green',
  offer_declined: 'rose',
  message: 'blue',
};

export const OFFER_TONE = { pending: 'amber', accepted: 'green', declined: 'rose', expired: 'slate', withdrawn: 'slate' };
export const ACTOR_TONE = { candidate: 'indigo', employer: 'blue', superadmin: 'amber', system: 'slate' };
export const ACTOR_LABEL = { candidate: 'Candidate', employer: 'Employer', superadmin: 'SuperAdmin', system: 'System' };

export function statusLabel(s) {
  return STATUS_LABEL[s] || (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
}

export function statusTone(s) {
  return STATUS_TONE[s] || 'slate';
}

export function capitalize(s) {
  const v = String(s || '');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function initialsOf(name) {
  return (
    String(name || '?')
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

export function daysSince(value) {
  if (!value) return Infinity;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY_MS);
}

export function formatDate(value) {
  if (!value) return '—';
  const plain = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(plain ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDate(value) {
  if (!value) return 'Never';
  const d = daysSince(value);
  if (d === Infinity) return '—';
  if (d < 0) return `in ${-d} days`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

export function formatStipend(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}/mo`;
}

export function locationLine(c) {
  return [c.city, c.state].filter(Boolean).join(', ');
}

export function educationLine(c) {
  return [c.degree, c.college].filter(Boolean).join(' · ');
}

/* ---------- list state (query string) ---------- */

export const LIST_DEFAULTS = {
  q: '',
  profile: 'all',
  company: '',
  cPosting: '',
  cStatus: '',
  sort: 'registeredAt',
  dir: 'desc',
  page: 1,
  size: 10,
  reg: '',
  login: '',
  account: '',
  country: '',
  state: '',
  city: '',
  degree: '',
  college: '',
  year: '',
  statuses: [],
  apps: '',
  offers: '',
};

export const PANEL_KEYS = ['reg', 'login', 'account', 'country', 'state', 'city', 'degree', 'college', 'year', 'statuses', 'apps', 'offers'];
export const PAGE_SIZES = [10, 25, 50];

export function freshListState() {
  return { ...LIST_DEFAULTS, statuses: [] };
}

export function isFilterSet(state, key) {
  const v = state[key];
  return Array.isArray(v) ? v.length > 0 : v !== LIST_DEFAULTS[key];
}

export function listStateToQuery(state) {
  const p = new URLSearchParams();
  for (const k of Object.keys(LIST_DEFAULTS)) {
    const v = state[k];
    if (Array.isArray(v) ? v.length : v !== LIST_DEFAULTS[k]) p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p.toString();
}

export function listStateFromQuery(qs) {
  const p = new URLSearchParams(qs || '');
  const s = freshListState();
  for (const k of Object.keys(LIST_DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k) || '';
    const def = LIST_DEFAULTS[k];
    if (Array.isArray(def)) s[k] = v.split(',').filter(Boolean);
    else if (typeof def === 'number') s[k] = parseInt(v, 10) || def;
    else s[k] = v;
  }
  if (!PAGE_SIZES.includes(s.size)) s.size = LIST_DEFAULTS.size;
  if (!['all', 'complete', 'incomplete'].includes(s.profile)) s.profile = 'all';
  if (!['asc', 'desc'].includes(s.dir)) s.dir = 'desc';
  return s;
}

export function companyApplications(c, state) {
  return c.applications.filter(
    (a) =>
      a.employerId === state.company &&
      (!state.cPosting || a.postingId === state.cPosting) &&
      (!state.cStatus || a.status === state.cStatus),
  );
}

export function candidateMatches(c, s) {
  if (s.profile === 'complete' && !c.profileComplete) return false;
  if (s.profile === 'incomplete' && c.profileComplete) return false;
  if (s.q) {
    const q = s.q.toLowerCase().trim();
    const hay = [c.name, c.email, c.phone, String(c.phone || '').replace(/\D/g, ''), c.college].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
  }
  if (s.company) {
    const contacted = c.contacts.some((x) => x.employerId === s.company);
    if (!companyApplications(c, s).length && !(contacted && !s.cPosting && !s.cStatus)) return false;
  }
  if (s.reg && daysSince(c.registeredAt) > Number(s.reg)) return false;
  if (s.login === 'never' && c.returned) return false;
  if (s.login === 'active7' && !(c.returned && daysSince(c.lastLoginAt) <= 7)) return false;
  if (s.login === 'inactive30' && !(c.lastLoginAt && daysSince(c.lastLoginAt) >= 30)) return false;
  if (s.account === 'active' && !c.active) return false;
  if (s.account === 'deactivated' && c.active) return false;
  for (const k of ['country', 'state', 'city', 'degree', 'college']) {
    if (s[k] && c[k] !== s[k]) return false;
  }
  if (s.year && c.gradYear !== s.year) return false;
  if (s.statuses.length && !c.applications.some((a) => s.statuses.includes(a.status))) return false;
  const n = c.applications.length;
  if (s.apps === 'none' && n) return false;
  if (s.apps && s.apps !== 'none' && n < parseInt(s.apps, 10)) return false;
  if (s.offers === 'none' && c.offers.length) return false;
  if (s.offers && s.offers !== 'none' && !c.offers.some((o) => o.status === s.offers)) return false;
  return true;
}

export function compareCandidates(state) {
  const k = state.sort;
  const val = (c) =>
    k === 'name'
      ? c.name.toLowerCase()
      : k === 'apps'
        ? c.applications.length
        : k === 'lastLoginAt'
          ? c.lastLoginAt || ''
          : c.registeredAt || '';
  const dir = state.dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const x = val(a);
    const y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir || String(a.id).localeCompare(String(b.id));
  };
}

export const LOGIN_FILTER_LABEL = {
  never: 'Never since sign-up',
  active7: 'Within 7 days',
  inactive30: '30+ days ago',
};

export const APPS_FILTER_LABEL = { none: 'None', '1+': '1 or more', '2+': '2 or more', '5+': '5 or more' };
export const OFFERS_FILTER_LABEL = { pending: 'Pending offer', accepted: 'Accepted offer', declined: 'Declined offer', none: 'No offers' };

export function chipLabel(key, value) {
  switch (key) {
    case 'reg':
      return `Registered: last ${value} days`;
    case 'login':
      return `Last login: ${(LOGIN_FILTER_LABEL[value] || value).toLowerCase()}`;
    case 'account':
      return `Account: ${capitalize(value)}`;
    case 'country':
      return `Country: ${value}`;
    case 'state':
      return `State: ${value}`;
    case 'city':
      return `City: ${value}`;
    case 'degree':
      return `Degree: ${value}`;
    case 'college':
      return `College: ${value}`;
    case 'year':
      return `Grad year: ${value}`;
    case 'statuses':
      return `Application status: ${value.map(statusLabel).join(', ')}`;
    case 'apps':
      return `Applications: ${(APPS_FILTER_LABEL[value] || value).toLowerCase()}`;
    case 'offers':
      return `Offer: ${value === 'none' ? 'none' : value}`;
    default:
      return String(value);
  }
}

/* ---------- CSV ---------- */

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function candidatesCsv(rows, companyName) {
  const header = [
    'Name',
    'Email',
    'Phone',
    'Degree',
    'College',
    'Grad year',
    'City',
    'State',
    'Country',
    'Profile',
    'Account',
    'Visible in search',
    'Applications',
    'Companies applied',
    'Offers',
    'Points',
    'Registered',
    'Last login',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const c of rows) {
    const companies = [...new Set(c.applications.map((a) => companyName(a.employerId)))].join('; ');
    lines.push(
      [
        c.name,
        c.email,
        c.phone,
        c.degree,
        c.college,
        c.gradYear,
        c.city,
        c.state,
        c.country,
        c.profileComplete ? 'Complete' : 'Incomplete',
        c.active ? 'Active' : 'Deactivated',
        c.searchable ? 'Yes' : 'No',
        c.applications.length,
        companies,
        c.offers.map((o) => `${companyName(o.employerId)} (${o.status})`).join('; '),
        c.points,
        c.registeredAt ? c.registeredAt.slice(0, 10) : '',
        c.returned && c.lastLoginAt ? c.lastLoginAt.slice(0, 10) : 'Not since sign-up',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

export function downloadText(filename, textContent, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([`\uFEFF${textContent}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
