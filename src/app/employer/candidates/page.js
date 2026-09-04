'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ShieldCheck } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { experienceSummaryLabel } from '@/lib/ipCandidateExperience';
import '@/components/ip/ip-employer-candidates-gemini.css';

const PAGE_SIZE = 10;
const SKILL_PILLS = ['All', 'React', 'Node.js', 'Figma', 'Python'];
const CHIPS = [
  { id: 'all', label: 'All candidates' },
  { id: 'available', label: 'Available soon' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'new', label: 'Recently updated' },
  { id: 'experience', label: 'Has experience' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function relativeUpdated(value) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const days = Math.round((Date.now() - t) / 86400000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days}d ago`;
}

function availLabel(c) {
  if (c.immediate_start || c.availability_bucket === 'immediate') return 'Immediate';
  if (c.availability_bucket === '2weeks') return '2 weeks';
  if (c.availability_bucket === '1month') return '1 month';
  if (c.availability_date) {
    try {
      return new Date(c.availability_date).toLocaleDateString();
    } catch {
      return '—';
    }
  }
  return '—';
}

function statusInfo(c) {
  const r = c.relationship || {};
  if (r.shortlisted) return { label: 'Shortlisted', cls: 'is-green' };
  if (r.applied) return { label: 'Applied', cls: 'is-blue' };
  if (r.invited) return { label: 'Invitation sent', cls: 'is-amber' };
  return { label: 'Available', cls: 'is-gray' };
}

function relLine(c) {
  const r = c.relationship || {};
  if (r.applied) return 'Existing application — avoid sending a duplicate invite';
  if (r.invited) return `Invitation sent${r.inviteInternshipTitle ? ` · ${r.inviteInternshipTitle}` : ''}`;
  if (r.shortlisted) return 'Already shortlisted · Contact details remain protected';
  return 'Open to outreach · No previous invitation from your company';
}

export default function CandidateSearchPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ found: 0, roleMatches: 0, shortlisted: 0, invitesPending: 0 });
  const [q, setQ] = useState('');
  const [cities, setCities] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [degree, setDegree] = useState('');
  const [degreeOptions, setDegreeOptions] = useState([]);
  const [workMode, setWorkMode] = useState('');
  const [skill, setSkill] = useState('All');
  const [chip, setChip] = useState('all');
  const [sort, setSort] = useState('match');
  const [experience, setExperience] = useState('');
  const [availability, setAvailability] = useState('');
  const [minCgpa, setMinCgpa] = useState('0');
  const [freshnessDays, setFreshnessDays] = useState('');
  const [matchInternshipId, setMatchInternshipId] = useState('');
  const [matchReady, setMatchReady] = useState(false);
  const [postings, setPostings] = useState([]);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [selectedInternship, setSelectedInternship] = useState('');
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerInternship, setOfferInternship] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerExtras, setOfferExtras] = useState({
    startDate: '', endDate: '', validUntil: '', letterUrl: '',
    onboardingInstructions: '', mentorName: '', hrContactEmail: '', hrContactPhone: '',
  });
  const [whyText, setWhyText] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { page, setPage, totalPages, total, pageItems } = useClientPagination(items, PAGE_SIZE);
  const [viewMode, setViewMode, { isMobile }] = useViewMode('ip_emp_cand_view', 'cards');

  const snapshot = useMemo(() => ({
    filters: {
      q, cities, degree, workMode, skill, chip, experience, availability, minCgpa, freshnessDays, matchInternshipId,
    },
    sort,
  }), [q, cities, degree, workMode, skill, chip, experience, availability, minCgpa, freshnessDays, matchInternshipId, sort]);
  const prefs = useListPrefsSync({
    tableKey: 'employer.candidates',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.q != null) setQ(f.q);
      if (Array.isArray(f.cities)) setCities(f.cities);
      if (f.degree != null) setDegree(f.degree);
      if (f.workMode != null) setWorkMode(f.workMode);
      if (f.skill != null) setSkill(f.skill);
      if (f.chip != null) setChip(f.chip);
      if (f.experience != null) setExperience(f.experience);
      if (f.availability != null) setAvailability(f.availability);
      if (f.minCgpa != null) setMinCgpa(String(f.minCgpa));
      if (f.freshnessDays != null) setFreshnessDays(f.freshnessDays);
      if (f.matchInternshipId != null) setMatchInternshipId(f.matchInternshipId);
      if (s.sort) setSort(s.sort);
    },
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }

  async function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (skill && skill !== 'All') params.set('skill', skill);
    if (matchInternshipId) params.set('internshipId', matchInternshipId);
    if (cities.length) params.set('city', cities.join(','));
    if (degree) params.set('degree', degree);
    if (workMode) params.set('workMode', workMode);
    if (chip && chip !== 'all') params.set('chip', chip);
    if (sort) params.set('sort', sort);
    if (experience) params.set('experience', experience);
    if (availability) params.set('availability', availability);
    if (Number(minCgpa) > 0) params.set('minCgpa', minCgpa);
    if (freshnessDays) params.set('freshnessDays', freshnessDays);
    const res = await fetch(`/api/ip/employer/candidates?${params.toString()}`);
    const data = await res.json();
    setItems(data.items || []);
    setSummary(data.summary || { found: (data.items || []).length, roleMatches: 0, shortlisted: 0, invitesPending: 0 });
    setMatchReady(Boolean(data.matchReady));
    setPage(1);
  }

  useEffect(() => {
    fetch('/api/ip/ref/cities').then((r) => r.json()).then((d) => setCityOptions(d.items || [])).catch(() => {});
    fetch('/api/ip/ref/degrees').then((r) => r.json()).then((d) => setDegreeOptions(d.items || [])).catch(() => {});
    fetch('/api/ip/employer/internships')
      .then((r) => r.json())
      .then((d) => setPostings((d.items || []).filter((i) => i.status === 'published')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prefs.ready) return;
    load();
  }, [prefs.ready, skill, matchInternshipId, chip, sort, cities, degree, workMode, experience, availability, minCgpa, freshnessDays]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearFilters() {
    setQ('');
    setCities([]);
    setDegree('');
    setWorkMode('');
    setSkill('All');
    setChip('all');
    setSort('match');
    setExperience('');
    setAvailability('');
    setMinCgpa('0');
    setFreshnessDays('');
    setMatchInternshipId('');
  }

  useEffect(() => {
    if (!isMobile) setFiltersOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    document.body.classList.add('ip-scroll-locked');
    return () => document.body.classList.remove('ip-scroll-locked');
  }, [filtersOpen]);

  const filterCount = [
    matchInternshipId,
    degree,
    workMode,
    chip !== 'all' ? chip : '',
    skill !== 'All' ? skill : '',
    cities.length ? 'cities' : '',
    experience,
    availability,
    Number(minCgpa) > 0 ? minCgpa : '',
    freshnessDays,
  ].filter(Boolean).length;

  function applyFiltersNow() {
    load();
    setFiltersOpen(false);
  }

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
      await load();
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
          ...offerExtras,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || 'Could not send offer');
        return;
      }
      showToast(`Offer sent to ${offerTarget.name}!`);
      setOfferTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const postingTitle = postings.find((p) => p.id === matchInternshipId)?.title;
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-emp-cand ip-mobile-bleed">
      {toast ? <div className="ip-ec-toast">{toast}</div> : null}

      <div className="ip-ec-head">
        <div>
          <h1>Search Candidates</h1>
          <p>Find suitable candidates across the talent database, compare profiles, shortlist promising people and invite them to a specific internship.</p>
        </div>
        <div className="ip-ec-privacy">
          <ShieldCheck className="size-3.5" aria-hidden />
          Privacy-protected candidate data
        </div>
      </div>

      {/* Mobile toolbar ≤767 */}
      <div className="ip-ec-m-toolbar">
        <div className="ip-ec-search">
          <Search aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search candidates…"
            aria-label="Search candidates"
          />
        </div>
        <button
          type="button"
          className={`ip-ec-filters-btn${filterCount || filtersOpen ? ' is-on' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(true)}
        >
          Filters
          {filterCount ? <span className="ip-ec-filters-btn__count">{filterCount}</span> : null}
        </button>
        <button type="button" className="ip-ec-primary" onClick={load}>Search</button>
        <ListPresetsBar {...prefs} />
      </div>

      {/* Desktop / tablet panel */}
      <div className="ip-ec-panel ip-ec-panel--desktop">
        <div className="ip-ec-search-row">
          <div className="ip-ec-search">
            <Search aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Search by name, college, skill, degree or keyword…"
              aria-label="Search candidates"
            />
          </div>
          <button type="button" className="ip-ec-primary" onClick={load}>Search candidates</button>
        </div>
        <div className="ip-ec-filterbar">
          <select className="ip-ec-select" value={matchInternshipId} onChange={(e) => setMatchInternshipId(e.target.value)} aria-label="Any internship">
            <option value="">Any internship</option>
            {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select className="ip-ec-select" value={degree} onChange={(e) => setDegree(e.target.value)} aria-label="Education">
            <option value="">Education</option>
            {degreeOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select className="ip-ec-select" value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Work mode">
            <option value="">Any work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on-site">On-site</option>
          </select>
          {CHIPS.map((c) => (
            <button key={c.id} type="button" className={`ip-ec-chip${chip === c.id ? ' is-on' : ''}`} onClick={() => setChip(c.id)}>
              {c.label}
            </button>
          ))}
          <button type="button" className="ip-ec-clear" onClick={clearFilters}>Clear filters</button>
        </div>
        <ListPresetsBar {...prefs} />
        <div className="ip-ec-skills-row">
          <span>Filter by skill:</span>
          {SKILL_PILLS.map((s) => (
            <button key={s} type="button" className={`ip-ec-chip${skill === s ? ' is-on' : ''}`} onClick={() => setSkill(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtersOpen ? (
        <div className="ip-sheet is-open">
          <button
            type="button"
            className="ip-sheet-scrim"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="ip-sheet__panel" role="dialog" aria-label="Filter candidates">
            <div className="ip-sheet__handle" aria-hidden />
            <div className="ip-sheet__head">
              <h3 className="ip-sheet__title">Filters</h3>
              <button type="button" className="ip-sheet__x" onClick={() => setFiltersOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ip-sheet__body ip-ec-sheet-body">
              <div className="ip-ec-fsec">
                <span>Role & education</span>
                <select className="ip-ec-select" value={matchInternshipId} onChange={(e) => setMatchInternshipId(e.target.value)} aria-label="Any internship">
                  <option value="">Any internship</option>
                  {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <select className="ip-ec-select" value={degree} onChange={(e) => setDegree(e.target.value)} aria-label="Education">
                  <option value="">Education</option>
                  {degreeOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <select className="ip-ec-select" value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Work mode">
                  <option value="">Any work mode</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="on-site">On-site</option>
                </select>
              </div>
              <div className="ip-ec-fsec">
                <span>Quick filters</span>
                <div className="ip-ec-chip-wrap">
                  {CHIPS.map((c) => (
                    <button key={`m-${c.id}`} type="button" className={`ip-ec-chip${chip === c.id ? ' is-on' : ''}`} onClick={() => setChip(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ip-ec-fsec">
                <span>Filter by skill</span>
                <div className="ip-ec-chip-wrap">
                  {SKILL_PILLS.map((s) => (
                    <button key={`m-skill-${s}`} type="button" className={`ip-ec-chip${skill === s ? ' is-on' : ''}`} onClick={() => setSkill(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ip-ec-fsec">
                <span>Location</span>
                <SearchableMultiSelect
                  options={cityOptions}
                  value={cities}
                  onChange={setCities}
                  placeholder="Search cities…"
                  ariaLabel="Cities"
                />
              </div>
              <div className="ip-ec-fsec">
                <span>Experience</span>
                <label className="ip-ec-check"><input type="radio" name="exp-m" checked={experience === ''} onChange={() => setExperience('')} /> Any</label>
                <label className="ip-ec-check"><input type="radio" name="exp-m" checked={experience === 'none'} onChange={() => setExperience('none')} /> No experience</label>
                <label className="ip-ec-check"><input type="radio" name="exp-m" checked={experience === '1plus'} onChange={() => setExperience('1plus')} /> 1+ year</label>
                <label className="ip-ec-check"><input type="radio" name="exp-m" checked={experience === '2plus'} onChange={() => setExperience('2plus')} /> 2+ years</label>
              </div>
              <div className="ip-ec-fsec">
                <span>Availability</span>
                <label className="ip-ec-check"><input type="radio" name="av-m" checked={availability === ''} onChange={() => setAvailability('')} /> Any</label>
                <label className="ip-ec-check"><input type="radio" name="av-m" checked={availability === 'immediate'} onChange={() => setAvailability('immediate')} /> Immediate</label>
                <label className="ip-ec-check"><input type="radio" name="av-m" checked={availability === '2weeks'} onChange={() => setAvailability('2weeks')} /> Within 2 weeks</label>
                <label className="ip-ec-check"><input type="radio" name="av-m" checked={availability === '1month'} onChange={() => setAvailability('1month')} /> Within 1 month</label>
              </div>
              <div className="ip-ec-fsec">
                <span>Academic score <em>{minCgpa || '0'}–10.0</em></span>
                <input type="range" min="0" max="10" step="0.1" value={minCgpa} onChange={(e) => setMinCgpa(e.target.value)} />
              </div>
              <div className="ip-ec-fsec">
                <span>Profile freshness</span>
                <label className="ip-ec-check"><input type="radio" name="fr-m" checked={freshnessDays === ''} onChange={() => setFreshnessDays('')} /> Any</label>
                <label className="ip-ec-check"><input type="radio" name="fr-m" checked={freshnessDays === '7'} onChange={() => setFreshnessDays('7')} /> Updated in 7 days</label>
                <label className="ip-ec-check"><input type="radio" name="fr-m" checked={freshnessDays === '30'} onChange={() => setFreshnessDays('30')} /> Updated in 30 days</label>
              </div>
              <div className="ip-ec-fsec">
                <span>Sort</span>
                <select className="ip-ec-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                  <option value="match">Best role match</option>
                  <option value="updated">Recently updated</option>
                  <option value="availability">Availability</option>
                  <option value="experience">Most experience</option>
                </select>
              </div>
              <div className="ip-ec-fsec">
                <span>Search summary</span>
                <div className="ip-ec-summary">
                  <div className="ip-ec-metric"><b>{summary.found}</b><span>Profiles found</span></div>
                  <div className="ip-ec-metric"><b>{summary.roleMatches}</b><span>Role matches</span></div>
                  <div className="ip-ec-metric"><b>{summary.shortlisted}</b><span>Shortlisted</span></div>
                  <div className="ip-ec-metric"><b>{summary.invitesPending}</b><span>Invites pending</span></div>
                </div>
              </div>
            </div>
            <div className="ip-sheet__actions">
              <button type="button" className="ip-ec-sbtn" onClick={clearFilters}>Reset</button>
              <button type="button" className="ip-ec-sbtn is-primary" onClick={applyFiltersNow}>
                Show {summary.found || total}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="ip-ec-context">
        <div>
          <strong>{summary.found} candidate{summary.found === 1 ? '' : 's'}</strong>
          {postingTitle ? <span className="ip-ec-rolepill" style={{ marginLeft: 8 }}>Role matching: {postingTitle}</span> : null}
        </div>
        <label>
          <span style={{ fontSize: 11, color: '#667085', marginRight: 6 }}>Sort</span>
          <select className="ip-ec-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="match">Best role match</option>
            <option value="updated">Recently updated</option>
            <option value="availability">Availability</option>
            <option value="experience">Most experience</option>
          </select>
        </label>
        <div className="ip-ec-view-toggle">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="ip-ec-layout">
        <div className="ip-ec-results">
          {viewMode === 'list' ? (
            <div className="ip-ph-list-wrap">
              <table className="ip-ph-list">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="p-3">Candidate</th>
                    <th className="p-3">College</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="p-3">
                        <Link href={`/employer/candidates/${c.id}?from=${encodeURIComponent('/employer/candidates')}`}>{c.name}</Link>
                      </td>
                      <td className="p-3">{c.college || '—'}</td>
                      <td className="p-3">{statusInfo(c).label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : pageItems.map((c) => {
            const st = statusInfo(c);
            const skills = Array.isArray(c.skills) ? c.skills : [];
            const r = c.relationship || {};
            const canInvite = !r.applied && !r.invited;
            const canOffer = Boolean(r.applied);
            return (
              <article key={c.id} className="ip-ec-card">
                <div className="ip-ec-card-main">
                  <div className="ip-ec-avatar">
                    {c.profile_picture_url ? <img src={c.profile_picture_url} alt="" /> : initials(c.name)}
                  </div>
                  <div className="ip-ec-person">
                    <h3>
                      <Link href={`/employer/candidates/${c.id}?from=${encodeURIComponent('/employer/candidates')}`}>{c.name}</Link>
                      <span className={`ip-ec-status ${st.cls}`}>{st.label}</span>
                    </h3>
                    <div className="ip-ec-sub">
                      {[c.degree, c.specialization, c.college, c.city].filter(Boolean).join(' · ') || 'Searchable profile'}
                    </div>
                    {skills.length ? (
                      <div className="ip-ec-skills">
                        {skills.map((s) => <span key={s} className="ip-ec-tag">{s}</span>)}
                      </div>
                    ) : null}
                  </div>
                  <div className="ip-ec-match">
                    <strong>{c.match_score != null ? `${Math.round(Number(c.match_score))}%` : '—'}</strong>
                    <small>{matchReady ? `match for ${postingTitle || 'selected role'}` : 'Select a posting for match %'}</small>
                    {c.match_why ? (
                      <button type="button" onClick={() => setWhyText(c.match_why)}>Why this match?</button>
                    ) : null}
                  </div>
                </div>
                <div className="ip-ec-facts">
                  <div className="ip-ec-fact"><b>{c.cgpa != null ? `${c.cgpa} CGPA` : '—'}</b><span>Academic</span></div>
                  <div className="ip-ec-fact">
                    <b title={experienceSummaryLabel(c.prior_experience, { fallbackYears: c.experience_years })}>
                      {experienceSummaryLabel(c.prior_experience, { fallbackYears: c.experience_years })}
                    </b>
                    <span>Relevant experience</span>
                  </div>
                  <div className="ip-ec-fact"><b>{availLabel(c)}</b><span>Availability</span></div>
                  <div className="ip-ec-fact"><b>{c.preferred_work_mode || '—'}</b><span>Work preference</span></div>
                  <div className="ip-ec-fact"><b>{relativeUpdated(c.updated_at)}</b><span>Profile activity</span></div>
                </div>
                <div className="ip-ec-foot">
                  <div className="ip-ec-rel">{relLine(c)}</div>
                  <div className="ip-ec-actions">
                    <Link className="ip-ec-sbtn" href={`/employer/candidates/${c.id}?from=${encodeURIComponent('/employer/candidates')}`}>View profile</Link>
                    {canOffer ? (
                      <button
                        type="button"
                        className="ip-ec-sbtn"
                        onClick={() => {
                          setOfferTarget(c);
                          setOfferInternship(matchInternshipId || '');
                          setStatusMsg('');
                        }}
                      >
                        Make offer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ip-ec-sbtn is-primary"
                      disabled={!canInvite}
                      onClick={() => {
                        setInviteTarget(c);
                        setSelectedInternship(matchInternshipId || '');
                        setStatusMsg('');
                      }}
                    >
                      {r.applied ? 'Invite unavailable' : r.invited ? 'Invite already sent' : 'Invite to apply'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!items.length ? (
            <div className="ip-ec-empty">
              <strong style={{ display: 'block', color: '#344054', marginBottom: 5 }}>No candidates match these filters</strong>
              Try removing a filter or broadening your search.
            </div>
          ) : null}
          {total > 0 ? (
            <div className="ip-ec-pager">
              <span>Showing {from}–{to} of {total}</span>
              <span>
                <button type="button" className="ip-ec-sbtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                {' '}Page {page} / {totalPages}{' '}
                <button type="button" className="ip-ec-sbtn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </span>
            </div>
          ) : null}
        </div>

        <aside className="ip-ec-side">
          <div className="ip-ec-box">
            <h3>Refine results</h3>
            <div className="ip-ec-fsec">
              <span>Location</span>
              <SearchableMultiSelect
                options={cityOptions}
                value={cities}
                onChange={setCities}
                placeholder="Search cities…"
                ariaLabel="Cities"
              />
            </div>
            <div className="ip-ec-fsec">
              <span>Experience</span>
              <label className="ip-ec-check"><input type="radio" name="exp" checked={experience === ''} onChange={() => setExperience('')} /> Any</label>
              <label className="ip-ec-check"><input type="radio" name="exp" checked={experience === 'none'} onChange={() => setExperience('none')} /> No experience</label>
              <label className="ip-ec-check"><input type="radio" name="exp" checked={experience === '1plus'} onChange={() => setExperience('1plus')} /> 1+ year</label>
              <label className="ip-ec-check"><input type="radio" name="exp" checked={experience === '2plus'} onChange={() => setExperience('2plus')} /> 2+ years</label>
            </div>
            <div className="ip-ec-fsec">
              <span>Availability</span>
              <label className="ip-ec-check"><input type="radio" name="av" checked={availability === ''} onChange={() => setAvailability('')} /> Any</label>
              <label className="ip-ec-check"><input type="radio" name="av" checked={availability === 'immediate'} onChange={() => setAvailability('immediate')} /> Immediate</label>
              <label className="ip-ec-check"><input type="radio" name="av" checked={availability === '2weeks'} onChange={() => setAvailability('2weeks')} /> Within 2 weeks</label>
              <label className="ip-ec-check"><input type="radio" name="av" checked={availability === '1month'} onChange={() => setAvailability('1month')} /> Within 1 month</label>
            </div>
            <div className="ip-ec-fsec">
              <span>Academic score <em>{minCgpa || '0'}–10.0</em></span>
              <input type="range" min="0" max="10" step="0.1" value={minCgpa} onChange={(e) => setMinCgpa(e.target.value)} />
            </div>
            <div className="ip-ec-fsec">
              <span>Profile freshness</span>
              <label className="ip-ec-check"><input type="radio" name="fr" checked={freshnessDays === ''} onChange={() => setFreshnessDays('')} /> Any</label>
              <label className="ip-ec-check"><input type="radio" name="fr" checked={freshnessDays === '7'} onChange={() => setFreshnessDays('7')} /> Updated in 7 days</label>
              <label className="ip-ec-check"><input type="radio" name="fr" checked={freshnessDays === '30'} onChange={() => setFreshnessDays('30')} /> Updated in 30 days</label>
            </div>
          </div>
          <div className="ip-ec-box">
            <h3>Search summary</h3>
            <div className="ip-ec-summary">
              <div className="ip-ec-metric"><b>{summary.found}</b><span>Profiles found</span></div>
              <div className="ip-ec-metric"><b>{summary.roleMatches}</b><span>Role matches</span></div>
              <div className="ip-ec-metric"><b>{summary.shortlisted}</b><span>Shortlisted</span></div>
              <div className="ip-ec-metric"><b>{summary.invitesPending}</b><span>Invites pending</span></div>
            </div>
          </div>
          <div className="ip-ec-box">
            <h3>Privacy & outreach</h3>
            <p>Search results only expose information allowed by the candidate&apos;s discovery settings. Private contact details stay restricted until the existing platform workflow permits access.</p>
            <p style={{ marginBottom: 0 }}><b style={{ color: '#344054' }}>Duplicate protection:</b> existing applications, previous invitations and shortlists are shown so you do not repeatedly contact the same candidate.</p>
          </div>
        </aside>
      </div>

      {whyText ? (
        <div className="ip-ec-backdrop" role="dialog" onClick={() => setWhyText('')}>
          <div className="ip-ec-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="ip-ec-mhead"><h2>Why this match?</h2><button type="button" className="ip-ec-sbtn" onClick={() => setWhyText('')}>×</button></div>
            <div className="ip-ec-mbody"><p>{whyText}</p></div>
          </div>
        </div>
      ) : null}

      {inviteTarget ? (
        <div className="ip-ec-backdrop" role="dialog">
          <div className="ip-ec-modal" style={{ maxWidth: 560 }}>
            <div className="ip-ec-mhead">
              <div>
                <h2>Invite candidate to apply</h2>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#667085' }}>Choose the exact internship before sending the invitation.</p>
              </div>
              <button type="button" className="ip-ec-sbtn" onClick={() => setInviteTarget(null)}>×</button>
            </div>
            <div className="ip-ec-mbody">
              {statusMsg ? <div className="ip-ec-alert">{statusMsg}</div> : (
                <div className="ip-ec-notice">The candidate will receive the internship title, employer identity and invitation message. Duplicate outreach is blocked when an application or invite already exists.</div>
              )}
              <label>Candidate</label>
              <div style={{ fontWeight: 800, marginBottom: 14 }}>{inviteTarget.name}</div>
              <label htmlFor="ip-ec-invite-posting">Internship</label>
              <select id="ip-ec-invite-posting" value={selectedInternship} onChange={(e) => setSelectedInternship(e.target.value)}>
                <option value="">Choose a posting</option>
                {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {selectedInternship ? (
                <div className="ip-ec-notice">
                  Invitation preview: We think your profile could be a good fit for {postings.find((p) => p.id === selectedInternship)?.title}. Review the role and choose whether you would like to apply.
                </div>
              ) : null}
            </div>
            <div className="ip-ec-mact">
              <button type="button" className="ip-ec-sbtn" onClick={() => setInviteTarget(null)}>Cancel</button>
              <button type="button" className="ip-ec-sbtn is-primary" disabled={!selectedInternship || busy} onClick={invite}>
                {busy ? 'Sending…' : 'Send invitation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerTarget ? (
        <div className="ip-ec-backdrop" role="dialog">
          <div className="ip-ec-modal">
            <div className="ip-ec-mhead">
              <h2>Make offer to {offerTarget.name}</h2>
              <button type="button" className="ip-ec-sbtn" onClick={() => setOfferTarget(null)}>×</button>
            </div>
            <div className="ip-ec-mbody">
              {statusMsg ? <div className="ip-ec-alert">{statusMsg}</div> : (
                <div className="ip-ec-notice">Offers require an existing application for that internship.</div>
              )}
              <label htmlFor="ip-ec-offer-posting">Internship</label>
              <select id="ip-ec-offer-posting" value={offerInternship} onChange={(e) => setOfferInternship(e.target.value)}>
                <option value="">Choose an internship</option>
                {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <label htmlFor="ip-ec-offer-msg">Message (optional)</label>
              <textarea id="ip-ec-offer-msg" value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} />
              <label>Start date</label>
              <input type="date" value={offerExtras.startDate} onChange={(e) => setOfferExtras((f) => ({ ...f, startDate: e.target.value }))} />
              <label>Valid until</label>
              <input type="date" value={offerExtras.validUntil} onChange={(e) => setOfferExtras((f) => ({ ...f, validUntil: e.target.value }))} />
            </div>
            <div className="ip-ec-mact">
              <button type="button" className="ip-ec-sbtn" onClick={() => setOfferTarget(null)}>Cancel</button>
              <button type="button" className="ip-ec-sbtn is-primary" disabled={!offerInternship || busy} onClick={sendOffer}>
                {busy ? 'Sending…' : 'Send offer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
