'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Download,
  EyeOff,
  FileText,
  Gift,
  GraduationCap,
  Mail,
  MapPin,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  UserX,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-candidates.css';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { onTablistKeyDown } from '@/lib/tablistKeys';
import { IpToastItem } from '@/components/ip/IpToast';
import {
  ACTOR_LABEL,
  ACTOR_TONE,
  IN_PROGRESS_STATUSES,
  OFFER_TONE,
  capitalize,
  formatDate,
  formatStipend,
  initialsOf,
  relativeDate,
  statusLabel,
  statusTone,
} from '@/lib/ipSuperadminCandidatesView';

const TABS = [
  ['overview', 'Overview', User],
  ['applications', 'Applications', FileText],
  ['companies', 'Companies', Building2],
  ['offers', 'Offers', Gift],
  ['activity', 'Activity', Activity],
];

const REL_TONE = { Applied: 'slate', Contacted: 'blue', Offered: 'amber', Hired: 'green', Completed: 'green' };
const OFFER_STATUSES_ON_APP = ['offered', 'hired', 'completed', 'declined_offer'];

function Pill({ tone = 'slate', plain = false, children }) {
  return <span className={`sac-pill sac-pill--${tone}${plain ? ' sac-pill--plain' : ''}`}>{children}</span>;
}

function NameHiddenPill() {
  return (
    <Pill tone="slate">
      <EyeOff className="w-3 h-3" aria-hidden />
      Name hidden on posting
    </Pill>
  );
}

function Na({ children = 'Not provided' }) {
  return <span className="sac-na">{children}</span>;
}

function Kv({ k, children }) {
  return (
    <div className="sac-kv">
      <span>{k}</span>
      <span>{children}</span>
    </div>
  );
}

function Section({ icon: Icon, title, className = '', children }) {
  return (
    <section className={`sac-sub ${className}`}>
      <h3 className="sac-h3">
        <Icon className="w-4 h-4 text-indigo-600" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, children }) {
  return (
    <div className="sac-empty">
      <span className="sac-eicon">
        <Icon className="w-6 h-6" aria-hidden />
      </span>
      <div className="font-bold text-slate-900 text-[14px]">{title}</div>
      <div className="text-[12px] text-slate-500 mt-1 max-w-md">{children}</div>
    </div>
  );
}

function Stat({ label, value, sub, className = 'text-slate-900' }) {
  return (
    <div className="sac-card p-4">
      <div className="sac-lbl">{label}</div>
      <div className={`text-[22px] font-black leading-none mt-2 ${className}`}>{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );
}

function eventText(type, co, title) {
  switch (type) {
    case 'applied':
      return `Applied to ${title} at ${co}`;
    case 'reapplied':
      return `Reapplied to ${title} at ${co}`;
    case 'shortlisted':
      return `${co} shortlisted the application for ${title}`;
    case 'interviewing':
      return `${co} moved ${title} to interviewing`;
    case 'offered':
    case 'offer_sent':
      return `${co} sent an offer for ${title}`;
    case 'offer_accepted':
      return `Accepted the offer from ${co}`;
    case 'offer_declined':
    case 'declined_offer':
      return `Declined the offer from ${co}`;
    case 'hired':
      return `Hired by ${co} as ${title}`;
    case 'completed':
      return `Internship at ${co} marked completed`;
    case 'rejected':
      return `${co} rejected the application for ${title}`;
    case 'withdrawn':
      return `Withdrew the application for ${title} at ${co}`;
    case 'message':
      return `${co} sent a message about ${title}`;
    default:
      return `${statusLabel(type)} · ${title} at ${co}`;
  }
}

export default function SuperAdminCandidateDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { data: session, status: sessionStatus } = useSession();
  const sessionRole = session?.user?.role;
  const beginLoad = useLatestRequest();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [tab, setTab] = useState('overview');
  const [open, setOpen] = useState(() => new Set());
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg) => {
    const key = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id: key, msg }]);
  }, []);

  useEffect(() => {
    setListQuery(new URLSearchParams(window.location.search).get('list') || '');
  }, []);

  async function load() {
    const isCurrent = beginLoad();
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await fetch(`/api/ip/superadmin/candidates/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
      });
      const body = await res.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (res.status === 404) {
        setNotFound(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(body.error || `Failed to load (${res.status})`);
        setData(null);
        return;
      }
      setData(body);
      setTab('overview');
      setOpen(new Set());
    } catch (e) {
      if (!isCurrent()) return;
      setError(e.message || 'Failed to load');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading' || !id) return;
    if (sessionRole === 'superadmin') {
      load();
      return;
    }
    setLoading(false);
    if (sessionStatus === 'authenticated') {
      setError(`Forbidden — Candidates requires SuperAdmin. Your session role is “${sessionRole || 'unknown'}”.`);
    }
  }, [id, sessionRole, sessionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const backHref = `/superadmin/candidates${listQuery ? `?${listQuery}` : ''}`;
  const keep = listQuery ? `?list=${encodeURIComponent(listQuery)}` : '';

  const companyById = useMemo(() => new Map((data?.companies || []).map((c) => [c.id, c])), [data]);
  const coName = (cid) => companyById.get(cid)?.name || 'Unknown company';

  const derived = useMemo(() => {
    if (!data) return null;
    const { candidate: c, applications: apps, offers, contacts } = data;
    const coIds = [
      ...new Set([...apps.map((a) => a.employerId), ...contacts.map((x) => x.employerId), ...offers.map((o) => o.employerId)]),
    ];
    const withdrawn = apps.filter((a) => a.status === 'withdrawn').length;
    const inProgress = apps.filter((a) => IN_PROGRESS_STATUSES.includes(a.status)).length;
    const name = (cid) => companyById.get(cid)?.name || 'Unknown company';

    const activity = [];
    for (const a of apps) {
      for (const e of a.events) {
        activity.push({
          at: e.at,
          before: e.before,
          actor: e.actor,
          text: eventText(e.type, name(a.employerId), a.postingTitle),
        });
      }
    }
    for (const o of offers) {
      if (o.applicationId && apps.some((a) => a.id === o.applicationId)) continue;
      if (o.createdAt) activity.push({ at: o.createdAt, actor: 'employer', text: `${name(o.employerId)} sent an offer for ${o.role || 'a role'}` });
      if (o.respondedAt && (o.status === 'accepted' || o.status === 'declined')) {
        activity.push({ at: o.respondedAt, actor: 'candidate', text: `${capitalize(o.status)} the offer from ${name(o.employerId)}` });
      }
    }
    for (const x of contacts) {
      if (x.at) activity.push({ at: x.at, actor: 'employer', text: `${name(x.employerId)} messaged the candidate (no application)` });
    }
    if (c.returned && c.lastLoginAt) activity.push({ at: c.lastLoginAt, actor: 'candidate', text: 'Last signed in' });
    if (c.registeredAt) activity.push({ at: c.registeredAt, actor: 'system', text: `Account created · ${c.signUpMethod}` });
    activity.sort((x, y) => String(y.at).localeCompare(String(x.at)));

    return { coIds, withdrawn, inProgress, activity };
  }, [data, companyById]);

  function copyEmail(email) {
    try {
      navigator.clipboard?.writeText(email).catch(() => {});
    } catch {
      /* clipboard unavailable */
    }
    toast(`Copied ${email}`);
  }

  function toggleApp(appId) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  const crumbs = (name) => (
    <>
      <nav className="text-[12px] font-medium text-slate-500 mb-1 flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
        <span>SuperAdmin</span>
        <span>/</span>
        <Link href={backHref} className="hover:text-indigo-600">
          Candidates
        </Link>
        {name ? (
          <>
            <span>/</span>
            <span className="text-slate-600">{name}</span>
          </>
        ) : null}
      </nav>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
        Back to candidates
      </Link>
    </>
  );

  if (loading) {
    return (
      <div className="ip-sac" aria-busy="true">
        <div className="sac-skel h-4 w-48 mb-3" />
        <div className="sac-skel h-4 w-32 mb-5" />
        <div className="sac-skel h-32 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sac-skel h-20" />
          ))}
        </div>
        <div className="sac-skel h-64" />
      </div>
    );
  }

  if (notFound || error || !data || !derived) {
    return (
      <div className="ip-sac">
        {crumbs('')}
        <div className="sac-card">
          {notFound ? (
            <Empty icon={UserX} title="Candidate not found">
              This candidate account doesn&apos;t exist or is not a candidate.
            </Empty>
          ) : (
            <div className="sac-empty">
              <span className="sac-eicon bg-rose-50 text-rose-500">
                <AlertTriangle className="w-6 h-6" aria-hidden />
              </span>
              <div className="font-bold text-slate-900 text-[15px]">Couldn&apos;t load this candidate</div>
              <div className="text-[12px] text-slate-500 mt-1 max-w-sm">{error || 'Something went wrong.'}</div>
              {sessionRole === 'superadmin' ? (
                <button type="button" className="sac-btn mt-4" onClick={load}>
                  <RotateCcw className="w-4 h-4" aria-hidden />
                  Try again
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { candidate: c, applications: apps, offers, contacts } = data;
  const { coIds, withdrawn, inProgress, activity } = derived;
  const counts = { applications: apps.length, companies: coIds.length, offers: offers.length, activity: activity.length };

  const companyButton = (cid) => (
    <Link
      href={`/superadmin/candidates?company=${encodeURIComponent(cid)}`}
      className="font-bold text-slate-900 hover:text-indigo-600 text-left"
      title={`See every candidate who applied to ${coName(cid)}`}
    >
      {coName(cid)}
    </Link>
  );

  const personLink = (p) =>
    p.isCandidate ? (
      <Link key={p.id} className="sac-link" href={`/superadmin/candidates/${encodeURIComponent(p.id)}${keep}`}>
        {p.name}
      </Link>
    ) : (
      <span key={p.id}>{p.name}</span>
    );

  const list = (arr) => (arr.length ? arr.join(', ') : <Na />);

  function timeline(events) {
    return (
      <ol className="sac-tl">
        {events.map((e, i) => (
          <li key={`${e.type}-${e.at}-${i}`}>
            <span className={`sac-dot sac-dot--${statusTone(e.type)}`} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{statusLabel(e.type)}</span>
              <Pill tone={ACTOR_TONE[e.actor] || 'slate'}>{ACTOR_LABEL[e.actor] || capitalize(e.actor)}</Pill>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {e.before ? `Before ${formatDate(e.at)}` : formatDate(e.at)}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  let body = null;
  if (tab === 'overview') {
    body = (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section icon={Mail} title="Contact">
          <Kv k="Email">{c.email}</Kv>
          <Kv k="Phone">{c.phone || <Na />}</Kv>
          <Kv k="Links">
            {c.links.length ? (
              c.links.map((l, i) => (
                <span key={`${l.href}-${i}`} className="block">
                  <a className="sac-link" href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                </span>
              ))
            ) : (
              <Na />
            )}
          </Kv>
        </Section>
        <Section icon={MapPin} title="Location">
          <Kv k="Country">{c.country || <Na />}</Kv>
          <Kv k="State">{c.state || <Na />}</Kv>
          <Kv k="City">{c.city || <Na />}</Kv>
          <Kv k="Willing to relocate">{c.hasProfileRow ? (c.willingToRelocate ? 'Yes' : 'No') : <Na />}</Kv>
        </Section>
        <Section icon={GraduationCap} title="Education" className="md:col-span-2">
          {c.academics.length ? (
            c.academics.map((e, i) => (
              <div key={i} className="sac-kv">
                <span>
                  <span className="block font-semibold text-slate-800">{e.title}</span>
                  <span className="block text-[12px]">
                    {[e.institution, e.studyStatus].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span>
                  <span className="block">{e.year || '—'}</span>
                  <span className="block text-[12px] font-medium text-slate-500">{e.score || 'Score not added'}</span>
                </span>
              </div>
            ))
          ) : (
            <div className="sac-na mt-2">No education added yet</div>
          )}
        </Section>
        <Section icon={SlidersHorizontal} title="Preferences">
          <Kv k="Work mode">{c.workMode ? capitalize(c.workMode) : <Na />}</Kv>
          <Kv k="Preferred locations">{list(c.preferredLocations)}</Kv>
          <Kv k="Preferred roles">{list(c.preferredRoles)}</Kv>
          <Kv k="Availability">
            {c.immediateStart ? 'Can start immediately' : c.availabilityDate ? `From ${formatDate(c.availabilityDate)}` : <Na />}
          </Kv>
        </Section>
        <Section icon={Sparkles} title="Skills">
          {c.skills.length ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {c.skills.map((s) => (
                <Pill key={s} tone="slate" plain>
                  {s}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="sac-na mt-2">No skills added yet</div>
          )}
        </Section>
        <Section icon={ShieldCheck} title="Account" className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <Kv k="Account status">{c.active ? <Pill tone="green">Active</Pill> : <Pill tone="rose">Deactivated</Pill>}</Kv>
            <Kv k="Visible in employer search">{c.searchable ? 'Yes' : <Pill tone="slate">Hidden</Pill>}</Kv>
            <Kv k="Sign-up method">{c.signUpMethod}</Kv>
            <Kv k="Referral code">{c.referralCode ? <code className="text-[12px]">{c.referralCode}</code> : '—'}</Kv>
            <Kv k="Referred by">{c.referredBy ? personLink(c.referredBy) : '—'}</Kv>
            <Kv k="Referrals made">
              {c.referrals.length
                ? c.referrals.map((r, i) => (
                    <span key={r.id}>
                      {i ? ', ' : ''}
                      {personLink(r)}
                    </span>
                  ))
                : '0'}
            </Kv>
            <Kv k="Points">{`${c.points} pts`}</Kv>
            <Kv k="Registered">{formatDate(c.registeredAt)}</Kv>
            <Kv k="Last login">
              {c.returned ? `${formatDate(c.lastLoginAt)} (${relativeDate(c.lastLoginAt)})` : 'Not since sign-up'}
            </Kv>
          </div>
        </Section>
      </div>
    );
  } else if (tab === 'applications') {
    body = apps.length ? (
      <div className="space-y-3">
        {apps.map((a) => {
          const isOpen = open.has(a.id);
          return (
            <div key={a.id} className="sac-arow">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {companyButton(a.employerId)}
                    {a.nameHidden ? <NameHiddenPill /> : null}
                    {a.reapplied ? (
                      <Pill tone="indigo">
                        <RotateCcw className="w-3 h-3" aria-hidden />
                        Reapplied
                      </Pill>
                    ) : null}
                  </div>
                  <div className="text-[13px] text-slate-600 mt-0.5">{a.postingTitle}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Applied {formatDate(a.appliedAt)} · Updated {relativeDate(a.updatedAt)}
                    {a.matchScore != null ? ` · Match ${Math.round(a.matchScore)}%` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Pill tone={statusTone(a.status)}>{statusLabel(a.status)}</Pill>
                  <button type="button" className="sac-btn h-8" onClick={() => toggleApp(a.id)} aria-expanded={isOpen}>
                    {isOpen ? 'Hide timeline' : 'Timeline'}
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" aria-hidden /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden />}
                  </button>
                </div>
              </div>
              {isOpen ? timeline(a.events) : null}
            </div>
          );
        })}
      </div>
    ) : (
      <Empty icon={FileText} title="No applications yet">
        {contacts.length
          ? `${[...new Set(contacts.map((x) => coName(x.employerId)))].join(', ')} contacted this candidate without an application. See the Companies tab.`
          : "This candidate hasn't applied to any posting."}
      </Empty>
    );
  } else if (tab === 'companies') {
    body = coIds.length ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {coIds.map((cid) => {
          const co = companyById.get(cid);
          const ca = apps.filter((a) => a.employerId === cid);
          const ct = contacts.filter((x) => x.employerId === cid);
          const of = offers.filter((o) => o.employerId === cid);
          const tags = [
            ca.length && 'Applied',
            ct.length && 'Contacted',
            (of.length || ca.some((a) => OFFER_STATUSES_ON_APP.includes(a.status))) && 'Offered',
            (ca.some((a) => a.status === 'hired' || a.status === 'completed') || of.some((o) => o.status === 'accepted')) &&
              'Hired',
            ca.some((a) => a.status === 'completed') && 'Completed',
          ].filter(Boolean);
          const dates = [
            ...ca.flatMap((a) => [a.appliedAt, a.updatedAt]),
            ...ct.map((x) => x.at),
            ...of.flatMap((o) => [o.createdAt, o.respondedAt]),
          ]
            .filter(Boolean)
            .sort();
          return (
            <div key={cid} className="sac-arow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="sac-av">{initialsOf(coName(cid))}</span>
                  <div className="min-w-0">
                    {companyButton(cid)}
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                      {co?.city || null}
                      {ca.some((a) => a.nameHidden) ? <NameHiddenPill /> : null}
                    </div>
                  </div>
                </div>
                <span className="text-[12px] font-bold text-slate-700 whitespace-nowrap">
                  {ca.length} application{ca.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {tags.map((r) => (
                  <Pill key={r} tone={REL_TONE[r]}>
                    {r}
                  </Pill>
                ))}
              </div>
              {dates.length ? (
                <div className="text-[11px] text-slate-500 mt-2">
                  First interaction {formatDate(dates[0])} · Last {relativeDate(dates[dates.length - 1])}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    ) : (
      <Empty icon={Building2} title="No company interactions yet">
        Companies appear here once the candidate applies, or an employer contacts them.
      </Empty>
    );
  } else if (tab === 'offers') {
    body = offers.length ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {offers.map((o) => (
          <div key={o.id} className="sac-arow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {companyButton(o.employerId)}
                <div className="text-[13px] text-slate-600">{o.role || 'Role not specified'}</div>
              </div>
              <Pill tone={OFFER_TONE[o.status] || 'slate'}>{capitalize(o.status)}</Pill>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 text-[12px]">
              <div>
                <div className="sac-lbl">Stipend</div>
                <div className="font-bold text-slate-800 mt-0.5">{formatStipend(o.stipend)}</div>
              </div>
              <div>
                <div className="sac-lbl">Start</div>
                <div className="font-bold text-slate-800 mt-0.5">{formatDate(o.startDate)}</div>
              </div>
              <div>
                <div className="sac-lbl">Valid until</div>
                <div className="font-bold text-slate-800 mt-0.5">{formatDate(o.validUntil)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty icon={Gift} title="No offers yet">
        Offers sent by employers will appear here.
      </Empty>
    );
  } else {
    body = (
      <ol className="sac-tl">
        {activity.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className={`sac-dot sac-dot--${ACTOR_TONE[e.actor] || 'slate'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{e.text}</span>
              <Pill tone={ACTOR_TONE[e.actor] || 'slate'}>{ACTOR_LABEL[e.actor] || capitalize(e.actor)}</Pill>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {e.before ? `Before ${formatDate(e.at)}` : formatDate(e.at)}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="ip-sac" data-testid="sa-candidate-detail">
      {crumbs(c.name)}

      {c.active ? null : (
        <div className="sac-banner mb-4" role="status">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
          <div>
            <div className="font-bold text-[13px]">Account deactivated</div>
            <div className="text-[12px]">This candidate can&apos;t sign in.</div>
          </div>
        </div>
      )}

      <div className="sac-card p-5 md:p-6 mb-4 flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          <span className="sac-av sac-av--lg">{initialsOf(c.name)}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] md:text-[24px] break-words">{c.name}</h1>
              {c.active ? <Pill tone="green">Active</Pill> : <Pill tone="rose">Deactivated</Pill>}
              {c.profileComplete ? <Pill tone="green">Complete</Pill> : <Pill tone="amber">Incomplete</Pill>}
              {c.searchable ? null : (
                <Pill tone="slate">
                  <EyeOff className="w-3 h-3" aria-hidden />
                  Hidden from search
                </Pill>
              )}
            </div>
            <div className="text-[13px] text-slate-600 font-medium mt-1 break-all">{c.email}</div>
            <div className="text-[12px] text-slate-500 mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
              <span>Registered {formatDate(c.registeredAt)}</span>
              <span>·</span>
              <span>Last login {c.returned ? relativeDate(c.lastLoginAt) : 'not since sign-up'}</span>
              <span>·</span>
              <span>Signed up with {c.signUpMethod}</span>
              {c.referredBy ? (
                <>
                  <span>·</span>
                  <span>Referred by {personLink(c.referredBy)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            className="sac-btn sac-btn--primary"
            onClick={() => {
              if (c.cvUrl) window.open(c.cvUrl, '_blank', 'noopener,noreferrer');
              else toast(`${c.name} hasn't uploaded a CV yet`);
            }}
          >
            <FileText className="w-4 h-4" aria-hidden />
            View CV
          </button>
          <button type="button" className="sac-btn" onClick={() => copyEmail(c.email)}>
            <Copy className="w-4 h-4 text-slate-400" aria-hidden />
            Copy email
          </button>
          {c.active ? (
            <Link href={`/superadmin/points?q=${encodeURIComponent(c.email)}`} className="sac-btn">
              <Coins className="w-4 h-4 text-amber-500" aria-hidden />
              Adjust points
            </Link>
          ) : (
            <button type="button" className="sac-btn" disabled title="Adjust Points only lists active accounts">
              <Coins className="w-4 h-4 text-amber-500" aria-hidden />
              Adjust points
            </button>
          )}
          {c.hasProfileRow ? (
            <a
              href={`/api/ip/superadmin/candidates/${encodeURIComponent(c.id)}/export`}
              className="sac-btn"
              onClick={() => toast(`Exporting ${c.name}'s record (Excel)`)}
            >
              <Download className="w-4 h-4 text-slate-400" aria-hidden />
              Export
            </a>
          ) : (
            <button type="button" className="sac-btn" disabled title="No profile data to export yet">
              <Download className="w-4 h-4 text-slate-400" aria-hidden />
              Export
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Applications" value={apps.length} sub={withdrawn ? `incl. ${withdrawn} withdrawn` : ''} />
        <Stat label="Companies" value={coIds.length} />
        <Stat label="In progress" value={inProgress} className="text-indigo-600" />
        <Stat label="Offers" value={offers.length} className="text-emerald-600" />
        <Stat label="Withdrawn" value={withdrawn} className="text-slate-500" />
      </div>

      <div className="sac-card">
        <div className="px-4 md:px-5 pt-4 pb-3 border-b border-slate-100 overflow-x-auto">
          <div className="sac-seg" role="tablist" onKeyDown={onTablistKeyDown} aria-label="Candidate sections">
            {TABS.map(([k, l, Icon]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'is-on' : ''}
                onClick={() => setTab(k)}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                {l}
                {counts[k] != null ? <span className="sac-cnt">{counts[k]}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 md:p-6">{body}</div>
      </div>

      <div className="sac-toasts" aria-live="polite">
        {toasts.map((t) => (
          <IpToastItem
            key={t.id}
            message={t.msg}
            onDismiss={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className="sac-toast"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
            <span>{t.msg}</span>
          </IpToastItem>
        ))}
      </div>
    </div>
  );
}
