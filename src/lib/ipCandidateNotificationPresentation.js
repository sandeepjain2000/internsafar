import { query } from '@/lib/db';
import { notifyUser } from '@/lib/ipNotify';
import { offerDeadlineEnd, offerDaysRemainingLabel, offerIsExpired } from '@/lib/ipOfferPresentation';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function blobOf(n) {
  return `${n.title || ''} ${n.body || ''} ${n.link || ''} ${n.category || ''}`.toLowerCase();
}

/** Filter bucket for the candidate inbox. Uses stored category first, then link/title. */
export function resolveCandidateBucket(n) {
  const stored = String(n.category || '').toLowerCase();
  if (stored === 'offer') return 'offers';
  if (stored === 'interview') return 'interviews';
  if (stored === 'message') return 'messages';
  if (stored === 'referral') return 'referrals';
  if (stored === 'application') {
    const blob = blobOf(n);
    if (blob.includes('/offers') || /\boffer\b/.test(blob)) return 'offers';
    if (blob.includes('interview')) return 'interviews';
    if (blob.includes('/messages')) return 'messages';
    return 'applications';
  }

  const blob = blobOf(n);
  if (blob.includes('/offers') || /\boffer\b/.test(blob)) return 'offers';
  if (blob.includes('interview')) return 'interviews';
  if (blob.includes('/messages') || blob.includes('new message')) return 'messages';
  if (blob.includes('referral') || blob.includes('/referral') || blob.includes('points')) return 'referrals';
  if (
    blob.includes('application') ||
    blob.includes('applicant') ||
    blob.includes('/applications') ||
    blob.includes('/internships')
  ) {
    return 'applications';
  }
  if (blob.includes('/profile') || blob.includes('profile')) return 'profile';
  return 'system';
}

export function actionForCandidateNotification(n, bucket) {
  const link = String(n.link || '').trim();
  const href = link && link !== '#' ? link : null;
  if (bucket === 'offers') return { label: 'Review Offer', href: href || '/candidate/offers' };
  if (bucket === 'interviews') return { label: 'View Interview Details', href: href || '/candidate/messages' };
  if (bucket === 'messages') return { label: 'Reply to Message', href: href || '/candidate/messages' };
  if (bucket === 'referrals') return { label: 'View Points Balance', href: href || '/candidate/referral' };
  if (bucket === 'applications') {
    if (href && href.includes('/internships/')) return { label: 'View Internship', href };
    return { label: 'View Application', href: href || '/candidate/applications' };
  }
  if (bucket === 'profile') return { label: 'View Profile', href: href || '/candidate/profile' };
  if (href) return { label: 'View details', href };
  return { label: 'View details', href: null };
}

function matchOffer(n, offers) {
  const meta = parseMeta(n.meta);
  if (meta.offerId) {
    const hit = offers.find((o) => o.id === meta.offerId);
    if (hit) return hit;
  }
  const blob = blobOf(n);
  const named = offers.filter((o) => {
    const title = String(o.role_title || o.title || '').toLowerCase();
    const company = String(o.company_name || '').toLowerCase();
    return (title && blob.includes(title)) || (company && blob.includes(company));
  });
  if (named.length === 1) return named[0];
  const pending = offers.filter((o) => String(o.status || '').toLowerCase() === 'pending' || offerIsExpired(o));
  if (pending.length === 1) return pending[0];
  return null;
}

function matchInterview(n, interviews) {
  const meta = parseMeta(n.meta);
  if (meta.applicationId) {
    const hit = interviews.find((a) => a.id === meta.applicationId);
    if (hit) return hit;
  }
  const blob = blobOf(n);
  const named = interviews.filter((a) => {
    const title = String(a.title || '').toLowerCase();
    const company = String(a.company_name || '').toLowerCase();
    return (title && blob.includes(title)) || (company && blob.includes(company));
  });
  if (named.length === 1) return named[0];
  if (interviews.length === 1) return interviews[0];
  return null;
}

function offerPriority(offer) {
  if (!offer) return { priority: 'normal', deadlineText: null, company: null };
  const company = offer.company_name || null;
  if (String(offer.status || '').toLowerCase() !== 'pending' && !offerIsExpired(offer)) {
    return { priority: 'normal', deadlineText: null, company };
  }
  const label = offerDaysRemainingLabel(offer);
  const end = offerDeadlineEnd(offer.valid_until);
  const days = end ? Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  if (offerIsExpired(offer) || (days != null && days <= 2)) {
    return { priority: 'urgent', deadlineText: label, company };
  }
  return { priority: 'action_required', deadlineText: label, company };
}

function interviewDeadline(interview) {
  if (!interview?.interview_at) return null;
  const d = new Date(interview.interview_at);
  if (Number.isNaN(d.getTime())) return null;
  return `Interview ${d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export function decorateCandidateNotification(n, { offers = [], interviews = [] } = {}) {
  const meta = parseMeta(n.meta);
  const bucket = resolveCandidateBucket(n);
  const action = actionForCandidateNotification(n, bucket);
  let company = meta.company || null;
  let priority = 'normal';
  let deadlineText = meta.deadlineText || null;

  if (bucket === 'offers') {
    const offer = matchOffer(n, offers);
    const extra = offerPriority(offer);
    company = extra.company || company;
    if (extra.priority !== 'normal') priority = extra.priority;
    if (extra.deadlineText) deadlineText = extra.deadlineText;
  } else if (bucket === 'interviews') {
    const interview = matchInterview(n, interviews);
    company = interview?.company_name || company;
    const when = interviewDeadline(interview) || (meta.interviewAt ? interviewDeadline({ interview_at: meta.interviewAt }) : null);
    if (when) {
      priority = 'action_required';
      deadlineText = when;
    }
  } else if (bucket === 'messages') {
    company = meta.company || company;
  } else if (bucket === 'applications') {
    company = meta.company || company;
  }

  const timeSensitive =
    priority === 'urgent'
    || priority === 'action_required'
    || Boolean(deadlineText);

  return {
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    created_at: n.created_at,
    read_at: n.read_at,
    bucket,
    company,
    priority,
    deadlineText,
    time_sensitive: timeSensitive,
    actionLabel: action.label,
    actionHref: action.href,
    isUnread: !n.read_at,
  };
}

export async function loadCandidateNotificationContext(userId) {
  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [userId]);
  const candidateId = cand.rows[0]?.id;
  if (!candidateId) return { offers: [], interviews: [] };

  const offers = await query(
    `SELECT o.id, o.status, o.valid_until, o.role_title, i.title, e.company_name
     FROM ip_offers o
     JOIN ip_internships i ON i.id = o.internship_id
     JOIN ip_employers e ON e.id = o.employer_id
     WHERE o.candidate_id = $1
     ORDER BY o.created_at DESC`,
    [candidateId],
  );
  const interviews = await query(
    `SELECT a.id, a.interview_at, i.title, e.company_name
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.candidate_id = $1 AND a.status = 'interviewing' AND a.interview_at IS NOT NULL
     ORDER BY a.interview_at DESC`,
    [candidateId],
  );
  return { offers: offers.rows, interviews: interviews.rows };
}

/** Insert a real expiry notice for pending offers that expire within 3 days (once per offer). */
export async function ensureCandidateOfferExpiryNotices(userId) {
  await ensureIpNotificationCategorySchema();
  const { offers } = await loadCandidateNotificationContext(userId);
  const pending = offers.filter((o) => String(o.status || '').toLowerCase() === 'pending');
  for (const offer of pending) {
    const end = offerDeadlineEnd(offer.valid_until);
    if (!end) continue;
    const days = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (days > 3 && !offerIsExpired(offer)) continue;
    const existing = await query(
      `SELECT id FROM ip_notifications
       WHERE user_id = $1 AND coalesce(meta->>'kind','') = 'offer_expiring' AND coalesce(meta->>'offerId','') = $2
       LIMIT 1`,
      [userId, offer.id],
    );
    if (existing.rows[0]) continue;
    const role = offer.role_title || offer.title || 'internship';
    const company = offer.company_name || 'the employer';
    const label = offerDaysRemainingLabel(offer) || 'Response needed';
    await notifyUser({
      userId,
      title: offerIsExpired(offer) ? 'Offer expired' : 'Offer expiring soon',
      body: `Your offer for ${role} at ${company} ${offerIsExpired(offer) ? 'has expired' : 'needs a response'}. Review official terms and submit your response.`,
      link: '/candidate/offers',
      category: 'offer',
      meta: {
        kind: 'offer_expiring',
        offerId: offer.id,
        company,
        validUntil: offer.valid_until,
        deadlineText: label,
      },
    });
  }
}
