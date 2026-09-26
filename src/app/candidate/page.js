'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Award,
  Coins,
  FileText,
  Gauge,
  MessageSquare,
  Search,
  Share2,
  User,
} from 'lucide-react';
import RatingsReceivedCard from '@/components/ip/RatingsReceivedCard';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';
import {
  PROFILE_DRAFT_DASH_MESSAGE,
  profileDraftDiffersFromServer,
  readProfileDraft,
} from '@/lib/ipCandidateProfileDraft';
import { parseExperienceEntries } from '@/lib/ipPostingBody';
import { readResponseJson } from '@/lib/readResponseJson';
import '@/components/ip/ip-candidate-dashboard-gemini.css';

const FEATURES = [
  {
    href: '/candidate/internships',
    title: 'Browse internships',
    desc: 'Find roles by stipend and mode',
    Icon: Search,
  },
  {
    href: '/candidate/applications',
    title: 'My applications',
    desc: 'Track every submission',
    Icon: FileText,
  },
  {
    href: '/candidate/messages',
    title: 'Messages',
    desc: 'Inbox with employers',
    Icon: MessageSquare,
  },
  {
    href: '/candidate/offers',
    title: 'Offers',
    desc: 'Review and respond to offers',
    Icon: Award,
  },
  {
    href: '/candidate/referral',
    title: 'Refer & earn',
    desc: 'Share your link, earn points',
    Icon: Share2,
  },
  {
    href: '/candidate/profile',
    title: 'Profile',
    desc: 'Keep your profile application-ready',
    Icon: User,
  },
];

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
 * Home stays above-the-fold: KPIs + pending + shortcuts. Browse owns recommended/saved.
 */
export default function CandidateDashboard() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [apps, setApps] = useState([]);
  const [offers, setOffers] = useState([]);
  const [dashReady, setDashReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [draftBanner, setDraftBanner] = useState('');

  useEffect(() => {
    fetch('/api/ip/candidate/profile')
      .then((r) => readResponseJson(r, {}))
      .then(async (d) => {
        setProfile(d.profile);
        const userId = d.profile?.user_id;
        if (!userId) return;
        let serverAcademics = [];
        try {
          const acad = await fetch('/api/ip/candidate/academics').then((r) => readResponseJson(r, {}));
          serverAcademics = (acad.items || []).map((a) => ({
            id: a.id,
            row_label: a.row_label || '',
            college: a.college || '',
            degree: a.degree || '',
            specialization: a.specialization || '',
            study_status: a.study_status || '',
            graduation_year: a.graduation_year || '',
            cgpa: a.cgpa || '',
          }));
        } catch {
          serverAcademics = [];
        }
        const serverExperiences = parseExperienceEntries(d.profile?.prior_experience);
        const draft = readProfileDraft(userId, d.profile?.account_email);
        const fromExit = typeof window !== 'undefined'
          && new URLSearchParams(window.location.search).get('draft') === '1';
        if (
          (fromExit && draft?.form)
          || profileDraftDiffersFromServer(draft, d.profile, serverAcademics, serverExperiences)
        ) {
          setDraftBanner(PROFILE_DRAFT_DASH_MESSAGE);
        }
      })
      .catch(() => {})
      .finally(() => setProfileReady(true));
    Promise.all([
      fetch('/api/ip/candidate/applications?pageSize=200', { cache: 'no-store', credentials: 'include' }).then((r) => readResponseJson(r, {})),
      fetch('/api/ip/offers').then((r) => readResponseJson(r, {})),
    ]).then(([appData, offerData]) => {
      setApps(appData.items || []);
      setOffers(offerData.items || []);
    }).catch(() => {}).finally(() => setDashReady(true));
  }, []);

  const points = Number(profile?.points ?? 0);
  const used = apps.length;
  const appsLeft = Math.max(0, Math.floor(points / POINTS_PER_APPLICATION));
  const readiness = useMemo(() => profileReadiness(profile), [profile]);

  const pendingOffers = useMemo(
    () =>
      offers
        .filter((o) => {
          if (String(o.status).toLowerCase() !== 'pending') return false;
          if (o.valid_until) {
            const end = new Date(o.valid_until).getTime();
            if (!Number.isNaN(end) && end < Date.now()) return false;
          }
          return true;
        })
        .slice(0, 2),
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
    if (profile) {
      for (const gap of readiness.items.filter((i) => !i.done)) {
        items.push({
          key: `profile-${gap.id}`,
          kind: 'profile',
          badge: 'Profile Incomplete',
          when: null,
          title: gap.label,
          meta: 'Complete this on your profile so employers can shortlist you.',
          href: '/candidate/profile',
          cta: 'Update Profile',
        });
      }
    }
    for (const o of pendingOffers) {
      items.push({
        key: `offer-${o.id}`,
        kind: 'offer',
        badge: 'Offer Awaiting Decision',
        when: offerExpiresLabel(o.valid_until),
        title: o.role_title || o.title || 'Internship offer',
        meta: [o.company_name, formatInternshipStipend(o)].filter(Boolean).join(' · '),
        href: '/candidate/offers',
        cta: 'Review Offer',
      });
    }
    for (const a of upcomingInterviews) {
      items.push({
        key: `iv-${a.id}`,
        kind: 'interview',
        badge: 'Interview Scheduled',
        when: formatInterviewWhen(a.interview_at),
        title: a.title || 'Interview',
        meta: [a.company_name, a.work_mode].filter(Boolean).join(' · '),
        href: '/candidate/applications',
        cta: 'View Details',
      });
    }
    return items;
  }, [profile, readiness, pendingOffers, upcomingInterviews]);

  const profileScoreReady = profileReady && Boolean(profile);
  const profilePill = readiness.percent >= 100 ? 'ip-cd-pill--ok' : 'ip-cd-pill--warn';

  return (
    <div className="ip-cand-dash ip-mobile-bleed">
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

      {draftBanner ? (
        <div className="ip-cd-draft-alert" role="status">
          <p>{draftBanner}</p>
          <Link href="/candidate/profile" className="ip-cd-draft-alert__cta">
            Open profile
          </Link>
        </div>
      ) : null}

      <section
        className={`ip-cd-pending${dashReady && profileReady && !pendingItems.length ? ' is-empty' : ''}`}
        aria-label="Pending actions"
      >
        <div className="ip-cd-pending__head">
          <div className="ip-cd-pending__title">
            <span className="ip-cd-pending__dot" aria-hidden />
            Pending Actions Required
          </div>
          <span className="ip-cd-pending__count">
            {!dashReady || !profileReady
              ? 'Loading…'
              : `${pendingItems.length} Item${pendingItems.length === 1 ? '' : 's'} Need Attention`}
          </span>
        </div>
        {!dashReady || !profileReady ? (
          <div className="ip-cd-pending__grid">
            {[0, 1].map((i) => (
              <div key={i} className="ip-cd-pending__card" aria-hidden>
                <div>
                  <h3>—</h3>
                  <p>—</p>
                </div>
              </div>
            ))}
          </div>
        ) : pendingItems.length ? (
          <div className="ip-cd-pending__grid">
            {pendingItems.map((item) => (
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
            ))}
          </div>
        ) : null}
      </section>

      <div className="ip-cd-stats" aria-label="Account summary">
        <div className="ip-cd-card ip-cd-stat">
          <div className="ip-cd-stat__top">
            <p className="ip-cd-stat__label">Reward points</p>
            <div className="ip-cd-stat__ico">
              <Coins size={14} aria-hidden />
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
              <FileText size={14} aria-hidden />
            </div>
          </div>
          <div className="ip-cd-stat__row">
            <p className="ip-cd-stat__value">{dashReady ? used : '—'}</p>
            <span className="ip-cd-pill ip-cd-pill--brand">Submitted</span>
          </div>
          <p className="ip-cd-stat__sub">Active role submissions under review.</p>
        </div>
        <Link href="/candidate/profile" className="ip-cd-card ip-cd-stat ip-cd-stat--link">
          <div className="ip-cd-stat__top">
            <p className="ip-cd-stat__label">Profile score</p>
            <div className="ip-cd-stat__ico ip-cd-stat__ico--green">
              <Gauge size={14} aria-hidden />
            </div>
          </div>
          <div className="ip-cd-stat__row">
            <p className="ip-cd-stat__value">
              {profileScoreReady ? `${readiness.percent}%` : '—'}
            </p>
            {profileScoreReady ? (
              <span className={`ip-cd-pill ${profilePill}`}>
                {readiness.percent >= 100 ? 'Ready' : 'Needs work'}
              </span>
            ) : null}
          </div>
          <p className="ip-cd-stat__sub">
            {profileScoreReady
              ? (readiness.percent >= 100
                ? 'Basics, resume, and skills look complete.'
                : `${readiness.doneCount} of ${readiness.items.length} readiness items done — open profile.`)
              : 'Loading profile quality…'}
          </p>
        </Link>
      </div>

      <div className="ip-cd-card ip-cd-shortcuts">
        <h2>Workspace Shortcuts</h2>
        <div className="ip-cd-features" aria-label="Workspace shortcuts">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="ip-cd-feature">
              <span className="ip-cd-feature__ico" aria-hidden>
                <f.Icon size={16} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </Link>
          ))}
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
