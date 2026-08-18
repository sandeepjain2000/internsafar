'use client';

import { useEffect, useState } from 'react';
import {
  FileText,
  GraduationCap,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import '@/components/ip/ip-employer-candidates-gemini.css';

const PAGE_SIZE = 10;
const SKILL_PILLS = ['All', 'React', 'Node.js', 'Figma', 'Python'];

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLine(c) {
  if (c.specialization) return c.specialization;
  if (c.degree) return c.degree;
  return 'Candidate';
}

function aboutLine(c) {
  const bits = [];
  if (c.degree) bits.push(c.degree);
  if (c.specialization) bits.push(c.specialization);
  if (c.study_status) bits.push(c.study_status);
  if (c.preferred_work_mode) bits.push(`Prefers ${c.preferred_work_mode}`);
  if (c.immediate_start) bits.push('Immediate start');
  if (c.willing_to_relocate) bits.push('Open to relocate');
  if (c.city) bits.push([c.city, c.state].filter(Boolean).join(', '));
  return bits.join(' · ') || 'Searchable profile — contact details stay private until you invite or offer.';
}

function availabilityLine(c) {
  if (c.availability_date) {
    try {
      return `Available ${new Date(c.availability_date).toLocaleDateString()}`;
    } catch {
      /* fall through */
    }
  }
  if (c.ongoing_commitment === false) return 'Available for Immediate Joining';
  if (c.study_status) return c.study_status;
  return null;
}

function cgpaLabel(c) {
  if (c.cgpa == null || c.cgpa === '') return null;
  return `${c.cgpa} CGPA`;
}

export default function CandidateSearchPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('All');
  const [matchInternshipId, setMatchInternshipId] = useState('');
  const [matchReady, setMatchReady] = useState(false);
  const [postings, setPostings] = useState([]);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [selectedInternship, setSelectedInternship] = useState('');
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerInternship, setOfferInternship] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerExtras, setOfferExtras] = useState({
    startDate: '',
    endDate: '',
    validUntil: '',
    letterUrl: '',
    onboardingInstructions: '',
    mentorName: '',
    hrContactEmail: '',
    hrContactPhone: '',
  });
  const [profileTarget, setProfileTarget] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const { page, setPage, totalPages, total, pageItems } = useClientPagination(items, PAGE_SIZE);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }

  async function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (skill && skill !== 'All') params.set('skill', skill);
    if (matchInternshipId) params.set('internshipId', matchInternshipId);
    const res = await fetch(`/api/ip/employer/candidates?${params.toString()}`);
    const data = await res.json();
    setItems(data.items || []);
    setMatchReady(Boolean(data.matchReady));
    setPage(1);
  }

  useEffect(() => {
    load();
    fetch('/api/ip/employer/internships')
      .then((r) => r.json())
      .then((d) => setPostings((d.items || []).filter((i) => i.status === 'published')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [skill, matchInternshipId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite() {
    if (!selectedInternship || !inviteTarget) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await fetch(`/api/ip/employer/candidates/${inviteTarget.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId: selectedInternship }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || 'Invite failed');
        return;
      }
      showToast(`Invitation sent to ${inviteTarget.name} successfully!`);
      setInviteTarget(null);
      setSelectedInternship('');
    } finally {
      setBusy(false);
    }
  }

  async function sendOffer() {
    if (!offerInternship || !offerTarget) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/ip/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: offerTarget.id,
          internshipId: offerInternship,
          message: offerMessage,
          startDate: offerExtras.startDate,
          endDate: offerExtras.endDate,
          validUntil: offerExtras.validUntil,
          letterUrl: offerExtras.letterUrl,
          onboardingInstructions: offerExtras.onboardingInstructions,
          mentorName: offerExtras.mentorName,
          hrContactEmail: offerExtras.hrContactEmail,
          hrContactPhone: offerExtras.hrContactPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || 'Could not send offer');
        return;
      }
      showToast(`Offer sent to ${offerTarget.name}!`);
      setOfferTarget(null);
      setOfferInternship('');
      setOfferMessage('');
      setOfferExtras({
        startDate: '',
        endDate: '',
        validUntil: '',
        letterUrl: '',
        onboardingInstructions: '',
        mentorName: '',
        hrContactEmail: '',
        hrContactPhone: '',
      });
    } finally {
      setBusy(false);
    }
  }

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-emp-cand">
      {toast ? <div className="ip-ec-toast">{toast}</div> : null}

      <div className="ip-ec-banner">
        <div>
          <h1>Candidate Talent Database</h1>
          <p>
            Browse verified student profiles, review GPAs and tech stacks, and invite top candidates
            directly.
          </p>
        </div>
        <div className="ip-ec-privacy">
          <ShieldCheck className="size-4" aria-hidden />
          Privacy Protected Profiles
        </div>
      </div>

      <div className="ip-ec-toolbar">
        <div className="ip-ec-search-row">
          <div className="ip-ec-search">
            <Search aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Search by student name, college, or skill (e.g. React, Python)..."
              aria-label="Search candidates"
            />
          </div>
          <button type="button" className="ip-ec-btn ip-ec-btn--primary" onClick={load}>
            Search Profiles
          </button>
        </div>

        <div className="ip-ec-match-row">
          <label htmlFor="ip-ec-match-posting">Match vs posting</label>
          <select
            id="ip-ec-match-posting"
            className="ip-ec-select"
            value={matchInternshipId}
            onChange={(e) => setMatchInternshipId(e.target.value)}
          >
            <option value="">Select a published posting…</option>
            {postings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="ip-ec-hint">
            {matchInternshipId
              ? matchReady
                ? 'Match % = skill overlap with that posting’s eligibility skills (same rule as candidate browse).'
                : 'Could not load that posting’s eligibility.'
              : 'Choose a posting to show a real match % on each card (not a fake number).'}
          </p>
        </div>

        <div className="ip-ec-skills">
          <span>Filter by skill:</span>
          {SKILL_PILLS.map((s) => (
            <button
              key={s}
              type="button"
              className={`ip-ec-pill${skill === s ? ' ip-ec-pill--on' : ''}`}
              onClick={() => setSkill(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="ip-ec-grid">
        {pageItems.map((c) => {
          const avail = availabilityLine(c);
          const gpa = cgpaLabel(c);
          const skills = Array.isArray(c.skills) ? c.skills : [];
          return (
            <article key={c.id} className="ip-ec-card">
              <div className="space-y-3">
                <div className="ip-ec-card-top">
                  <div className="ip-ec-person">
                    <div className="ip-ec-avatar">
                      {c.profile_picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.profile_picture_url} alt="" />
                      ) : (
                        initials(c.name)
                      )}
                    </div>
                    <div>
                      <h3>{c.name}</h3>
                      <p>{roleLine(c)}</p>
                    </div>
                  </div>
                  {c.match_score != null ? (
                    <span className="ip-ec-match">{Math.round(Number(c.match_score))}% Match</span>
                  ) : null}
                </div>

                <div className="ip-ec-meta">
                  <div className="ip-ec-meta-row">
                    <GraduationCap aria-hidden />
                    <span>{c.college || '—'}</span>
                  </div>
                  <div className="ip-ec-meta-bottom">
                    <strong>{gpa || 'CGPA not listed'}</strong>
                    {avail ? <span className="ip-ec-avail">{avail}</span> : null}
                  </div>
                </div>

                <p className="ip-ec-about">{aboutLine(c)}</p>

                {skills.length ? (
                  <div className="ip-ec-tags">
                    {skills.map((s) => (
                      <span key={s} className="ip-ec-tag">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="ip-ec-actions">
                <button
                  type="button"
                  className="ip-ec-btn ip-ec-btn--outline ip-ec-btn--sm"
                  onClick={() => setProfileTarget(c)}
                >
                  <FileText className="size-3.5" aria-hidden />
                  View profile
                </button>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ip-ec-btn ip-ec-btn--outline ip-ec-btn--sm"
                    onClick={() => {
                      setOfferTarget(c);
                      setOfferInternship(matchInternshipId || '');
                      setOfferMessage('');
                      setOfferExtras({
                        startDate: '',
                        endDate: '',
                        validUntil: '',
                        letterUrl: '',
                        onboardingInstructions: '',
                        mentorName: '',
                        hrContactEmail: '',
                        hrContactPhone: '',
                      });
                      setStatusMsg('');
                    }}
                  >
                    Make offer
                  </button>
                  <button
                    type="button"
                    className="ip-ec-btn ip-ec-btn--primary ip-ec-btn--sm"
                    style={{ width: 'auto', height: 'auto' }}
                    onClick={() => {
                      setInviteTarget(c);
                      setSelectedInternship(matchInternshipId || '');
                      setStatusMsg('');
                    }}
                  >
                    <UserPlus className="size-3.5" aria-hidden />
                    Invite to Apply
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!items.length ? (
          <p className="ip-ec-empty">No searchable candidates match yet.</p>
        ) : null}
      </div>

      {total > 0 ? (
        <div className="ip-ec-foot">
          <span>
            Showing {from}–{to} of {total}
          </span>
          <div className="ip-ec-foot-nav">
            <button
              type="button"
              className="ip-ec-btn ip-ec-btn--outline"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              className="ip-ec-btn ip-ec-btn--outline"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {/* Public profile summary (no CV URL — privacy) */}
      {profileTarget ? (
        <div className="ip-ec-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ip-ec-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <h3>{profileTarget.name}</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600 }}>
                  {roleLine(profileTarget)}
                </p>
              </div>
              <button
                type="button"
                className="ip-ec-btn ip-ec-btn--outline"
                aria-label="Close"
                onClick={() => setProfileTarget(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <strong style={{ color: '#334155' }}>Education &amp; GPA</strong>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {profileTarget.college || '—'}
                  {cgpaLabel(profileTarget) ? ` — ${cgpaLabel(profileTarget)}` : ''}
                </p>
              </div>
              <div>
                <strong style={{ color: '#334155' }}>About</strong>
                <p style={{ margin: '0.25rem 0 0' }}>{aboutLine(profileTarget)}</p>
              </div>
              <div>
                <strong style={{ color: '#334155' }}>Skills</strong>
                <div className="ip-ec-tags" style={{ marginTop: '0.375rem' }}>
                  {(profileTarget.skills || []).map((s) => (
                    <span key={s} className="ip-ec-tag">
                      {s}
                    </span>
                  ))}
                  {!(profileTarget.skills || []).length ? <span>—</span> : null}
                </div>
              </div>
              <p className="ip-ec-hint">
                Full resume / contact stay private until an invite or offer interaction allows sharing.
              </p>
            </div>
            <div className="ip-ec-modal-actions">
              <button type="button" className="ip-ec-btn ip-ec-btn--outline" onClick={() => setProfileTarget(null)}>
                Close
              </button>
              <button
                type="button"
                className="ip-ec-btn ip-ec-btn--primary"
                style={{ width: 'auto' }}
                onClick={() => {
                  setInviteTarget(profileTarget);
                  setSelectedInternship(matchInternshipId || '');
                  setProfileTarget(null);
                }}
              >
                Invite to Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteTarget ? (
        <div className="ip-ec-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ip-ec-modal">
            <h3>Invite {inviteTarget.name}</h3>
            {statusMsg ? <div className="ip-ec-alert">{statusMsg}</div> : null}
            <div>
              <label htmlFor="ip-ec-invite-posting">Choose a posting</label>
              <select
                id="ip-ec-invite-posting"
                className="ip-ec-select"
                value={selectedInternship}
                onChange={(e) => setSelectedInternship(e.target.value)}
              >
                <option value="">Choose a posting</option>
                {postings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="ip-ec-modal-actions">
              <button type="button" className="ip-ec-btn ip-ec-btn--outline" onClick={() => setInviteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-ec-btn ip-ec-btn--primary"
                style={{ width: 'auto' }}
                disabled={!selectedInternship || busy}
                onClick={invite}
              >
                {busy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerTarget ? (
        <div className="ip-ec-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ip-ec-modal">
            <h3>Make offer to {offerTarget.name}</h3>
            {statusMsg ? <div className="ip-ec-alert">{statusMsg}</div> : null}
            <div>
              <label htmlFor="ip-ec-offer-posting">Choose an internship</label>
              <select
                id="ip-ec-offer-posting"
                className="ip-ec-select"
                value={offerInternship}
                onChange={(e) => setOfferInternship(e.target.value)}
              >
                <option value="">Choose an internship</option>
                {postings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ip-ec-offer-msg">Message (optional)</label>
              <textarea
                id="ip-ec-offer-msg"
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                placeholder="Message to include with the offer"
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-start">Start date</label>
              <input
                id="ip-ec-offer-start"
                type="date"
                className="ip-ec-select"
                value={offerExtras.startDate}
                onChange={(e) => setOfferExtras((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-end">End date</label>
              <input
                id="ip-ec-offer-end"
                type="date"
                className="ip-ec-select"
                value={offerExtras.endDate}
                onChange={(e) => setOfferExtras((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-until">Valid until</label>
              <input
                id="ip-ec-offer-until"
                type="date"
                className="ip-ec-select"
                value={offerExtras.validUntil}
                onChange={(e) => setOfferExtras((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-letter">Offer letter URL</label>
              <input
                id="ip-ec-offer-letter"
                className="ip-ec-select"
                value={offerExtras.letterUrl}
                onChange={(e) => setOfferExtras((f) => ({ ...f, letterUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-onboard">Onboarding instructions</label>
              <textarea
                id="ip-ec-offer-onboard"
                value={offerExtras.onboardingInstructions}
                onChange={(e) => setOfferExtras((f) => ({ ...f, onboardingInstructions: e.target.value }))}
                placeholder="First-day time, location, documents…"
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-mentor">Assigned mentor / tech lead</label>
              <input
                id="ip-ec-offer-mentor"
                className="ip-ec-select"
                value={offerExtras.mentorName}
                onChange={(e) => setOfferExtras((f) => ({ ...f, mentorName: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-hr-email">HR contact email</label>
              <input
                id="ip-ec-offer-hr-email"
                type="email"
                className="ip-ec-select"
                value={offerExtras.hrContactEmail}
                onChange={(e) => setOfferExtras((f) => ({ ...f, hrContactEmail: e.target.value }))}
                placeholder="Uses company email if blank"
              />
            </div>
            <div>
              <label htmlFor="ip-ec-offer-hr-phone">HR contact phone</label>
              <input
                id="ip-ec-offer-hr-phone"
                className="ip-ec-select"
                value={offerExtras.hrContactPhone}
                onChange={(e) => setOfferExtras((f) => ({ ...f, hrContactPhone: e.target.value }))}
                placeholder="Uses company phone if blank"
              />
            </div>
            <div className="ip-ec-modal-actions">
              <button type="button" className="ip-ec-btn ip-ec-btn--outline" onClick={() => setOfferTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-ec-btn ip-ec-btn--primary"
                style={{ width: 'auto' }}
                disabled={!offerInternship || busy}
                onClick={sendOffer}
              >
                {busy ? 'Sending…' : 'Send offer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
