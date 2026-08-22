'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Award,
  Bookmark,
  Coins,
  FileText,
  MessageSquare,
  Search,
  Share2,
  User,
} from 'lucide-react';
import RatingsReceivedCard from '@/components/ip/RatingsReceivedCard';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import '@/components/ip/ip-candidate-dashboard-gemini.css';

const FEATURES = [
  {
    href: '/candidate/internships',
    title: 'Browse internships',
    desc: 'Filter by stipend, eligibility, and work mode.',
    Icon: Search,
  },
  {
    href: '/candidate/applications',
    title: 'My applications',
    desc: 'Track status of every submitted application.',
    Icon: FileText,
  },
  {
    href: '/candidate/messages',
    title: 'Messages',
    desc: 'Chat with verified employers and recruiters.',
    Icon: MessageSquare,
  },
  {
    href: '/candidate/offers',
    title: 'Offers',
    desc: 'Review and respond to internship offers.',
    Icon: Award,
  },
  {
    href: '/candidate/referral',
    title: 'Refer & earn',
    desc: 'Share your link and earn candidate points.',
    Icon: Share2,
  },
  {
    href: '/candidate/profile',
    title: 'Profile',
    desc: 'Keep your profile ready for applications.',
    Icon: User,
  },
];

function stipendLabel(row) {
  const n = Number(row?.stipend_inr);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString('en-IN')}/mo`;
}

function modeLabel(row) {
  return row?.work_mode || row?.location || null;
}

function matchTone(score) {
  if (score >= 85) return 'ok';
  if (score >= 70) return 'mid';
  return 'low';
}

function profileReadiness(profile) {
  const skills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean) : [];
  const basics = Boolean(
    profile?.name && profile?.college && profile?.degree && profile?.city,
  );
  const resume = Boolean(profile?.resume_url);
  const skillsOk = skills.length >= 2;
  const items = [
    { id: 'basics', label: 'Basic Details & Education', done: basics },
    { id: 'resume', label: 'Resume Uploaded (PDF)', done: resume },
    {
      id: 'skills',
      label: skillsOk ? 'Technical Skills' : 'Add 2 Technical Skills',
      done: skillsOk,
      pending: !skillsOk,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const percent = Math.round((doneCount / items.length) * 100);
  return { items, percent, doneCount };
}

function formatInterviewWhen(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((startThat - startToday) / 86400000);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff === 0) return `Today · ${time}`;
    if (dayDiff === 1) return `Tomorrow · ${time}`;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Scheduled';
  }
}

function offerExpiresLabel(validUntil) {
  if (!validUntil) return null;
  try {
    const end = new Date(validUntil);
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires in 1 day';
    return `Expires in ${days} days`;
  } catch {
    return null;
  }
}

/**
 * Layout from candidate_home_redesign.html + pending/profile blocks from
 * placementhub_candidate_dashboard.html (content pane only).
 */
export default function CandidateDashboard() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [apps, setApps] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [saved, setSaved] = useState([]);
  const [offers, setOffers] = useState([]);
  const [busySave, setBusySave] = useState('');
  const [dashReady, setDashReady] = useState(false);

  const reloadLists = useCallback(async () => {
    const [rec, sav] = await Promise.all([
      fetch('/api/ip/candidate/internships?recommended=1').then((r) => r.json()).catch(() => ({})),
      fetch('/api/ip/candidate/saved').then((r) => r.json()).catch(() => ({})),
    ]);
    setRecommended((rec.items || []).slice(0, 3));
    setSaved((sav.items || []).slice(0, 4));
  }, []);

  useEffect(() => {
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => {});
    Promise.all([
      fetch('/api/ip/candidate/applications?pageSize=100').then((r) => r.json()).catch(() => ({})),
      fetch('/api/ip/offers').then((r) => r.json()).catch(() => ({})),
    ]).then(([appData, offerData]) => {
      setApps(appData.items || []);
      setOffers(offerData.items || []);
    }).finally(() => setDashReady(true));
    reloadLists();
  }, [reloadLists]);

  const points = Number(profile?.points ?? 0);
  const used = apps.length;
  const completed = apps.filter((a) => String(a.status).toLowerCase() === 'completed');
  const appsLeft = Math.max(0, Math.floor(points / POINTS_PER_APPLICATION));
  const readiness = useMemo(() => profileReadiness(profile), [profile]);

  const pendingOffers = useMemo(
    () => offers.filter((o) => String(o.status).toLowerCase() === 'pending').slice(0, 2),
    [offers],
  );

  const upcomingInterviews = useMemo(() => {
    const now = Date.now() - 60 * 60 * 1000;
    return apps
      .filter((a) => a.interview_at && new Date(a.interview_at).getTime() >= now)
      .sort((a, b) => new Date(a.interview_at) - new Date(b.interview_at))
      .slice(0, 2);
  }, [apps]);

  const pendingItems = useMemo(() => {
    const items = [];
    for (const o of pendingOffers) {
      items.push({
        key: `offer-${o.id}`,
        kind: 'offer',
        badge: 'Offer Awaiting Decision',
        when: offerExpiresLabel(o.valid_until),
        title: o.role_title || o.title || 'Internship offer',
        meta: [o.company_name, stipendLabel(o)].filter(Boolean).join(' · '),
        href: '/candidate/offers',
        cta: 'Review Offer',
      });
    }
    for (const a of upcomingInterviews) {
      items.push({
        key: `iv-${a.id}`,
        kind: 'interview',
        badge: 'Interview scheduled',
        when: formatInterviewWhen(a.interview_at),
        title: a.title || 'Interview',
        meta: [a.company_name, a.work_mode].filter(Boolean).join(' · '),
        href: '/candidate/applications',
        cta: 'View Details',
      });
    }
    return items.slice(0, 2);
  }, [pendingOffers, upcomingInterviews]);

  async function toggleSave(internshipId, currentlySaved) {
    if (!internshipId || busySave) return;
    setBusySave(internshipId);
    try {
      await fetch('/api/ip/candidate/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId, saved: !currentlySaved }),
      });
      await reloadLists();
    } finally {
      setBusySave('');
    }
  }

  return (
    <div className="ip-cand-dash">
      <div className="ip-cd-welcome">
        <div>
          <h1>Welcome, {session?.user?.name || 'candidate'}</h1>
          <p>Here is your placement summary and next steps.</p>
        </div>
        <Link href="/candidate/internships" className="ip-cd-browse-cta">
          <Search size={16} aria-hidden />
          Browse Internships
        </Link>
      </div>

      <section className="ip-cd-pending" aria-label="Pending actions">
        <div className="ip-cd-pending__head">
          <div className="ip-cd-pending__title">
            <span className="ip-cd-pending__dot" aria-hidden />
            Pending Actions Required
          </div>
          <span className="ip-cd-pending__count">
            {!dashReady
              ? 'Loading…'
              : `${pendingItems.length} Item${pendingItems.length === 1 ? '' : 's'} Need Attention`}
          </span>
        </div>
        <div className="ip-cd-pending__grid">
          {!dashReady ? (
            [0, 1].map((i) => (
              <div key={i} className="ip-cd-pending__card" aria-hidden>
                <div>
                  <h3>—</h3>
                  <p>—</p>
                </div>
              </div>
            ))
          ) : pendingItems.length ? (
            pendingItems.map((item) => (
              <div key={item.key} className="ip-cd-pending__card">
                <div>
                  <div className="ip-cd-pending__badges">
                    <span className={`ip-cd-pending__badge ip-cd-pending__badge--${item.kind}`}>
                      {item.badge}
                    </span>
                    {item.when ? <span className="ip-cd-pending__when">{item.when}</span> : null}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.meta || '—'}</p>
                </div>
                <Link href={item.href} className="ip-cd-pending__cta">
                  {item.cta}
                </Link>
              </div>
            ))
          ) : (
            <div className="ip-cd-pending__card">
              <div>
                <h3>No pending actions</h3>
                <p>Offers and interviews will show here when they need a response.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="ip-cd-features">
        {FEATURES.map((f) => (
          <div key={f.href} className="ip-cd-card ip-cd-feature">
            <div>
              <div className="ip-cd-feature__ico" aria-hidden>
                <f.Icon size={16} />
              </div>
              <h2>{f.title}</h2>
              <p>{f.desc}</p>
            </div>
            <Link href={f.href} className="ip-cd-open">
              Open
            </Link>
          </div>
        ))}
      </div>

      <div className="ip-cd-stats">
        <div className="ip-cd-card ip-cd-stat">
          <div className="ip-cd-stat__top">
            <p className="ip-cd-stat__label">Reward points</p>
            <div className="ip-cd-stat__ico">
              <Coins size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cd-stat__row">
            <p className="ip-cd-stat__value">{profile ? points : '—'}</p>
            <span className="ip-cd-pill ip-cd-pill--ok">Active balance</span>
          </div>
          <p className="ip-cd-stat__sub">
            Spent directly when applying ({POINTS_PER_APPLICATION} pts/app
            {profile ? ` = ${appsLeft} applications left` : ''}).
          </p>
        </div>
        <div className="ip-cd-card ip-cd-stat">
          <div className="ip-cd-stat__top">
            <p className="ip-cd-stat__label">Applications sent</p>
            <div className="ip-cd-stat__ico ip-cd-stat__ico--indigo">
              <FileText size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cd-stat__row">
            <p className="ip-cd-stat__value">{dashReady ? used : '—'}</p>
            <span className="ip-cd-pill ip-cd-pill--brand">Submitted</span>
          </div>
          <p className="ip-cd-stat__sub">Active role submissions under review.</p>
        </div>
        <div className="ip-cd-card ip-cd-stat">
          <div className="ip-cd-stat__top">
            <p className="ip-cd-stat__label">Internships Completed</p>
            <div className="ip-cd-stat__ico ip-cd-stat__ico--green">
              <Award size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cd-stat__row">
            <p className="ip-cd-stat__value">{completed.length}</p>
            {completed.length ? <span className="ip-cd-pill ip-cd-pill--ok">Verified</span> : null}
          </div>
          <p className="ip-cd-stat__sub">Verified completion certificates issued.</p>
        </div>
      </div>

      <div className="ip-cd-mid">
        <div className="ip-cd-mid__main">
          <div className="ip-cd-card ip-cd-panel ip-cd-ready">
            <div className="ip-cd-ready__head">
              <div>
                <h2>Profile Readiness</h2>
                <p className="ip-cd-panel__sub">Finish these items so employers can shortlist you faster.</p>
              </div>
              <span className={`ip-cd-pill ${readiness.percent >= 100 ? 'ip-cd-pill--ok' : 'ip-cd-pill--warn'}`}>
                {readiness.percent}% Ready
              </span>
            </div>
            <div className="ip-cd-ready__bar" aria-hidden>
              <span style={{ width: `${readiness.percent}%` }} />
            </div>
            <ul className="ip-cd-ready__list">
              {readiness.items.map((item) => (
                <li key={item.id} className={item.done ? 'is-done' : 'is-pending'}>
                  <span>{item.label}</span>
                  <strong>{item.done ? 'Done' : 'Action pending'}</strong>
                </li>
              ))}
            </ul>
            <Link href="/candidate/profile" className="ip-cd-link">
              Update Profile →
            </Link>
          </div>

          <div className="ip-cd-card ip-cd-panel">
            <div className="ip-cd-panel__head">
              <div>
                <h2>Recommended for you</h2>
                <p className="ip-cd-panel__sub">Ranked by eligibility match score</p>
              </div>
              <span className="ip-cd-engine">Match Engine</span>
            </div>
            {recommended.length ? (
              <div className="ip-cd-list">
                {recommended.map((i) => {
                  const score = Number(i.match_score);
                  const meta = [i.company_name, stipendLabel(i), modeLabel(i)].filter(Boolean).join(' · ');
                  return (
                    <div key={i.id} className="ip-cd-row">
                      <div>
                        <div className="ip-cd-row__title">
                          <Link href={`/candidate/internships/${i.id}`}>
                            <h3>{i.title}</h3>
                          </Link>
                          {Number.isFinite(score) ? (
                            <span className={`ip-cd-match ip-cd-match--${matchTone(score)}`}>
                              {Math.round(score)}% Match
                            </span>
                          ) : null}
                        </div>
                        <p>{meta || '—'}</p>
                      </div>
                      <div className="ip-cd-row__actions">
                        <button
                          type="button"
                          className={`ip-cd-bookmark${i.saved ? ' is-on' : ''}`}
                          aria-label={i.saved ? 'Remove bookmark' : 'Bookmark role'}
                          disabled={busySave === i.id}
                          onClick={() => toggleSave(i.id, Boolean(i.saved))}
                        >
                          <Bookmark size={16} aria-hidden />
                        </button>
                        <Link href={`/candidate/internships/${i.id}`} className="ip-cd-open">
                          Open
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ip-cd-empty">
                <p>No recommendations yet — complete skills on your profile.</p>
              </div>
            )}
          </div>
        </div>

        <div className="ip-cd-card ip-cd-panel ip-cd-saved">
          <div className="ip-cd-panel__head">
            <div className="ip-cd-saved__title">
              <span className="ip-cd-saved__ico" aria-hidden>
                <Bookmark size={14} />
              </span>
              <h2>Saved internships</h2>
            </div>
          </div>
          <p className="ip-cd-panel__sub">Shortcuts to roles you bookmarked for quick applying.</p>
          {saved.length ? (
            <div className="ip-cd-list">
              {saved.map((i) => (
                <div key={i.id} className="ip-cd-saved-row">
                  <div>
                    <h3>{i.title}</h3>
                    <p>{[i.company_name, stipendLabel(i)].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <Link href={`/candidate/internships/${i.id}`} className="ip-cd-open">
                    Open
                  </Link>
                </div>
              ))}
              <Link href="/candidate/internships?saved=1" className="ip-cd-link">
                View All Listings →
              </Link>
            </div>
          ) : (
            <div className="ip-cd-empty">
              <p>No saved roles yet.</p>
              <Link href="/candidate/internships" className="ip-cd-link">
                Browse all postings →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="ip-cd-card ip-cd-ratings">
        <h2>Ratings received</h2>
        <p className="ip-cd-ratings__sub">Mutual ratings from employers after engagement.</p>
        <div className="ip-cd-ratings__inner">
          <RatingsReceivedCard />
        </div>
      </div>
    </div>
  );
}
