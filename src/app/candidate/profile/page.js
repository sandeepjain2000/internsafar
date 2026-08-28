'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Check,
  Download,
  GraduationCap,
  Info,
  Lock,
  Plus,
  Shield,
  Star,
  Trash2,
  User,
} from 'lucide-react';
import { imageAcceptAttr, resumeAcceptAttr } from '@/lib/ipFileUpload';
import { validateOptionalPhone } from '@/lib/ipPhoneValidation';
import IpUploadButton from '@/components/ip/IpUploadButton';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import SearchableSelect from '@/components/ip/SearchableSelect';
import useIpCityCatalog from '@/hooks/useIpCityCatalog';
import {
  emptyExperience,
  parseExperienceEntries,
  serializeExperienceEntries,
} from '@/lib/ipPostingBody';
import '@/components/ip/ip-candidate-profile-gemini.css';

const PROFILE_TABS = [
  { id: 'basics', label: '1. Basics & Contact', Icon: User, saveLabel: 'Save Basics & Contact', wizardStep: 1 },
  { id: 'academic', label: '2. Academic & Skills', Icon: GraduationCap, saveLabel: 'Save Academic & Skills', wizardStep: 2 },
  { id: 'readiness', label: '3. Work Readiness', Icon: Briefcase, saveLabel: 'Save Work Readiness', wizardStep: 3 },
  { id: 'privacy', label: '4. Privacy & Photo', Icon: Lock, saveLabel: 'Save Privacy Settings' },
  { id: 'history', label: '5. Endorsements (Read-Only)', Icon: Star },
];

const WIZARD_ORDER = ['basics', 'academic', 'readiness'];

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];

const COUNTRY_OPTIONS = ['India', 'Bangladesh', 'Sri Lanka', 'Indonesia'];

const COMMITMENT_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'none', label: 'No — no other commitments' },
  { value: 'other_internship', label: 'Yes — another internship' },
  { value: 'offline_classes', label: 'Yes — offline / college classes' },
  { value: 'part_time_work', label: 'Yes — part-time job or other work' },
  { value: 'other', label: 'Yes — other (use note)' },
];

function newResumeLinkId() {
  return `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Show human filename, not the long /api/ip/files?key=… path. */
function resumeDisplayName(url, fallbackName = '') {
  if (fallbackName) return fallbackName;
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    let name = raw;
    if (raw.includes('key=')) {
      const u = new URL(raw, 'http://local');
      name = decodeURIComponent(u.searchParams.get('key') || '');
    }
    name = decodeURIComponent(name.split('/').pop() || name);
    const uuidPrefixed = name.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i,
    );
    if (uuidPrefixed) return uuidPrefixed[1];
    return name || 'Uploaded resume';
  } catch {
    return 'Uploaded resume';
  }
}

const PHONE_DIAL_OPTIONS = [
  { value: '+91', label: 'India (+91)' },
  { value: '+1', label: 'United States (+1)' },
  { value: '+44', label: 'United Kingdom (+44)' },
  { value: '+65', label: 'Singapore (+65)' },
  { value: '+971', label: 'UAE (+971)' },
  { value: '+61', label: 'Australia (+61)' },
];

function emptyAcademicRow() {
  return { row_label: '', college: '', degree: '', specialization: '', study_status: '', graduation_year: '', cgpa: '' };
}

function skillList(form) {
  if (Array.isArray(form?.skills)) return form.skills.map((s) => String(s).trim()).filter(Boolean);
  return String(form?.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function initialsFrom(form) {
  const a = String(form?.first_name || '').trim().charAt(0);
  const b = String(form?.last_name || '').trim().charAt(0);
  return ((a + b) || 'C').toUpperCase();
}

function Field({ label, hint, required, optional, children, span, invalid }) {
  const classes = [
    'ip-cp-field',
    span === 2 ? 'ip-cp-span-2' : '',
    span === 3 ? 'ip-cp-span-3' : '',
    invalid ? 'is-missing' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <label className="ip-cp-label">
        {label}
        {required ? <span className="ip-cp-req"> *</span> : null}
        {optional ? <span className="ip-cp-opt"> (optional)</span> : null}
      </label>
      {hint ? <p className="ip-cp-hint">{hint}</p> : null}
      {children}
      {invalid ? <p className="ip-cp-error" role="alert">Required to unlock applying.</p> : null}
    </div>
  );
}

/** Step 1 fields that must be filled before applications unlock. */
const BASICS_REQUIRED = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'Current City' },
  { key: 'state', label: 'State / Union Territory' },
  { key: 'preferred_work_mode', label: 'Preferred Work Mode' },
  { key: 'availability_date', label: 'Earliest Availability / Start Date' },
  { key: 'resume_url', label: 'Resume / CV' },
];

function missingBasics(form) {
  if (!form) return [];
  return BASICS_REQUIRED.filter(({ key }) => !String(form[key] ?? '').trim());
}

export default function CandidateProfilePage() {
  const [form, setForm] = useState(null);
  const [academics, setAcademics] = useState([emptyAcademicRow()]);
  const [experiences, setExperiences] = useState([emptyExperience()]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [endorsements, setEndorsements] = useState([]);
  const [profileTab, setProfileTab] = useState('basics');
  /** Highest wizard step index the user may open (0=basics). Advanced by Save & Next. */
  const [wizardUnlockedThru, setWizardUnlockedThru] = useState(0);
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState('idle');
  const [newSkill, setNewSkill] = useState('');
  const [photoStatus, setPhotoStatus] = useState('No file selected');
  const [resumeFileName, setResumeFileName] = useState('');
  const [linkDraftError, setLinkDraftError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  /** Save failures must show next to the buttons; the top alert is off-screen from the save row. */
  const [saveError, setSaveError] = useState('');
  /** Turns on red highlighting for blank required fields once the user has tried to save. */
  const [showMissing, setShowMissing] = useState(false);
  const { cityOptions, placeCityOptions, stateOptions, findCity } = useIpCityCatalog();
  const cityChoices = useMemo(() => {
    const needle = String(form?.state || '').trim().toLowerCase();
    if (!needle) return placeCityOptions;
    return placeCityOptions.filter((o) => String(o.state || '').trim().toLowerCase() === needle);
  }, [placeCityOptions, form?.state]);

  useEffect(() => {
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => {
        setForm(d.profile);
        setResumeFileName(resumeDisplayName(d.profile?.resume_url));
        setExperiences(parseExperienceEntries(d.profile?.prior_experience));
      });
    fetch('/api/ip/candidate/academics')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items || []).map((a) => ({
          id: a.id,
          row_label: a.row_label || '',
          college: a.college || '',
          degree: a.degree || '',
          specialization: a.specialization || '',
          study_status: a.study_status || '',
          graduation_year: a.graduation_year || '',
          cgpa: a.cgpa || '',
        }));
        setAcademics(items.length ? items : [emptyAcademicRow()]);
      })
      .catch(() => {});
    fetch('/api/ip/endorsements')
      .then((r) => r.json())
      .then((d) => setEndorsements(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form?.college || academics[0]?.college) return;
    const key = 'ip_profile_college_prefilled_once';
    try {
      if (localStorage.getItem(key)) return;
      setAcademics((rows) => [{ ...(rows[0] || emptyAcademicRow()), college: form.college }, ...rows.slice(1)]);
      localStorage.setItem(key, '1');
    } catch {
      // Saving remains available if storage is blocked.
    }
  }, [form?.college, academics]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setAcademicField(idx, field, value) {
    setAcademics((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addAcademicRow() {
    setAcademics((rows) => [...rows, emptyAcademicRow()]);
  }

  function removeAcademicRow(idx) {
    setAcademics((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));
  }

  const skills = skillList(form);

  function addSkillTag() {
    const next = newSkill.trim();
    if (!next) return;
    if (skills.some((s) => s.toLowerCase() === next.toLowerCase())) {
      setNewSkill('');
      return;
    }
    set('skills', [...skills, next]);
    setNewSkill('');
  }

  function removeSkill(tag) {
    set('skills', skills.filter((s) => s !== tag));
  }

  function addResumeLink() {
    setForm((f) => ({
      ...f,
      resume_links: [
        ...(Array.isArray(f.resume_links) ? f.resume_links : []),
        { id: newResumeLinkId(), title: '', url: '' },
      ],
    }));
    setLinkDraftError('');
  }

  function updateResumeLink(id, patch) {
    setForm((f) => ({
      ...f,
      resume_links: (Array.isArray(f.resume_links) ? f.resume_links : []).map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
  }

  function removeResumeLink(id) {
    setForm((f) => ({
      ...f,
      resume_links: (Array.isArray(f.resume_links) ? f.resume_links : []).filter((l) => l.id !== id),
    }));
  }

  async function saveProfileBody() {
    const dial = form.phone_country_code || '+91';
    const phoneCheck = validateOptionalPhone(form.phone, dial);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.error);
      throw new Error(phoneCheck.error);
    }
    setPhoneError('');

    const payload = {
      ...form,
      phone: String(form.phone || '').trim(),
      phone_country_code: dial,
      skills,
      resume_links: (Array.isArray(form.resume_links) ? form.resume_links : []).filter(
        (l) => String(l?.url || '').trim() || String(l?.title || '').trim(),
      ),
      preferred_locations: typeof form.preferred_locations === 'string'
        ? form.preferred_locations.split(',').map((s) => s.trim()).filter(Boolean)
        : form.preferred_locations,
      prior_experience: serializeExperienceEntries(experiences),
      // Empty date inputs must be null — "" breaks Postgres DATE columns and blocks Save & Next
      availability_date: String(form.availability_date || '').trim() || null,
    };
    // Never send join-only / server fields back as updatable columns
    delete payload.id;
    delete payload.user_id;
    delete payload.account_email;
    delete payload.email;
    delete payload.points;
    delete payload.application_allowance;
    delete payload.referral_code;
    delete payload.profile_complete;
    delete payload.created_at;
    delete payload.updated_at;
    if (profileTab === 'academic') {
      delete payload.college;
      delete payload.degree;
      delete payload.specialization;
      delete payload.study_status;
      delete payload.graduation_year;
      delete payload.cgpa;
    }
    const res = await fetch('/api/ip/candidate/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not save profile (HTTP ${res.status})`);
    return data;
  }

  async function save(e) {
    if (e?.preventDefault) e.preventDefault();
    setSaving(true);
    setMessage('');
    setSaveError('');
    setShowMissing(true);
    try {
      let data = {};
      if (profileTab === 'academic') {
        const res = await fetch('/api/ip/candidate/academics', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: academics }),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not save academics (HTTP ${res.status})`);
        data = await saveProfileBody();
      } else {
        data = await saveProfileBody();
      }
      setForm((current) => (current ? { ...current, profile_complete: data.profileComplete } : current));
      setMessage(
        data.profileComplete
          ? 'Profile saved — applications unlocked.'
          : `${PROFILE_TABS.find((tab) => tab.id === profileTab)?.label || 'Profile'} saved.`
      );
      return true;
    } catch (err) {
      const text = err?.message || 'Could not save. Please try again.';
      setMessage(text);
      setSaveError(text);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function requestEmailCode() {
    setMessage('');
    const res = await fetch('/api/ip/candidate/profile/email-change/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEmail }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Could not send code');
    setEmailStep('verify');
    setMessage(data.message);
  }

  async function verifyEmailCode() {
    const res = await fetch('/api/ip/candidate/profile/email-change/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: emailCode }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Could not verify code');
    setForm((current) => ({ ...current, account_email: data.newEmail }));
    setEmailStep('idle');
    setNewEmail('');
    setEmailCode('');
    setMessage('Login email changed. Sign in with the new email next time.');
  }

  async function onPhotoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoStatus('Uploading…');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/api/ip/candidate/profile/photo/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.hint || 'Upload failed');
      const url = data.profile_picture_url || data.fileUrl;
      if (url) set('profile_picture_url', url);
      setPhotoStatus(file.name);
      setMessage('Photo uploaded. Display is controlled below.');
    } catch (err) {
      setPhotoStatus('Upload failed');
      setMessage(err.message || 'Upload failed');
    }
  }

  const workMode = form?.preferred_work_mode || '';
  const knownMode = WORK_MODES.includes(workMode);
  const collegeDone = Boolean((academics[0]?.college || form?.college) && (academics[0]?.degree || form?.degree));
  const unlockItems = useMemo(() => {
    if (!form) return [];
    return [
      { label: 'Full Name *', done: Boolean(form.first_name && form.last_name) },
      { label: 'Country *', done: Boolean(form.country) },
      { label: 'City & State *', done: Boolean(form.city && form.state) },
      { label: 'College / Edu *', done: collegeDone },
      { label: 'Resume Link *', done: Boolean(form.resume_url) },
      { label: 'Key Skills *', done: skills.length > 0 },
    ];
  }, [form, collegeDone, skills.length]);

  const completion = useMemo(() => {
    if (!form) return 0;
    const checks = [
      Boolean(form.first_name && form.last_name),
      Boolean(form.country),
      Boolean(form.city),
      Boolean(form.state),
      collegeDone,
      Boolean(form.resume_url),
      skills.length > 0,
      Boolean(form.preferred_work_mode),
      Boolean(form.availability_date),
      Boolean(form.linkedin_url || form.github_url || form.personal_website),
      Boolean(form.profile_picture_url),
      Boolean(serializeExperienceEntries(experiences)),
      Boolean(form.phone),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, collegeDone, skills.length, experiences]);

  function setExperienceField(idx, field, value) {
    setExperiences((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addExperienceRow() {
    setExperiences((rows) => [...rows, emptyExperience()]);
  }

  function removeExperienceRow(idx) {
    setExperiences((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));
  }

  const wizardIndex = WIZARD_ORDER.indexOf(profileTab);
  const isWizardTab = wizardIndex >= 0;

  function tabIsLocked(tabId) {
    const wi = WIZARD_ORDER.indexOf(tabId);
    if (wi < 0) return false; // privacy / history always available
    return wi > wizardUnlockedThru;
  }

  function selectTab(tabId) {
    if (tabIsLocked(tabId)) {
      setMessage('Use Save & Next to continue through the profile steps in order.');
      return;
    }
    setProfileTab(tabId);
  }

  function goWizard(delta) {
    const next = WIZARD_ORDER[wizardIndex + delta];
    if (next) setProfileTab(next);
  }
  if (!form) {
    return (
      <div className="ip-cand-profile">
        <p className="ip-cp-empty">Loading…</p>
      </div>
    );
  }

  const unlocked = Boolean(form.profile_complete);
  const waReady = Boolean(String(form.whatsapp_number || form.phone || '').trim());
  const tgReady = Boolean(String(form.telegram_handle || '').trim());
  const activeTab = PROFILE_TABS.find((tab) => tab.id === profileTab);
  const missingRequired = showMissing && profileTab === 'basics' ? missingBasics(form) : [];
  const isMissing = (key) => missingRequired.some((f) => f.key === key);

  return (
    <div className="ip-cand-profile">
      <div className="ip-cp-hero">
        <div>
          <div className="ip-cp-hero__title">
            <h1>Candidate profile</h1>
            <span className="ip-cp-chip">Candidate Workspace</span>
          </div>
          <p>Complete required basics to unlock applying. Work-readiness &amp; extra details remain optional.</p>
        </div>
        <div className="ip-cp-complete">
          <div className="ip-cp-complete__icon" aria-hidden>
            <Shield />
          </div>
          <div>
            <div className="ip-cp-complete__row">
              <span>Profile Completion</span>
              <strong>{completion}%</strong>
            </div>
            <p>Measures overall profile detail • <em>Distinct from role match %</em></p>
          </div>
        </div>
      </div>

      {message ? <div className="ip-cp-alert" role="status">{message}</div> : null}

      <div className="ip-cp-unlock">
        <div className="ip-cp-unlock__head">
          <div className="ip-cp-unlock__title">
            <span className={`ip-cp-dot${unlocked ? ' is-on' : ''}`} />
            <h2>Application Unlock Checklist</h2>
          </div>
          <span className={`ip-cp-unlock__badge${unlocked ? ' is-on' : ''}`}>
            {unlocked ? <Check /> : null}
            {unlocked ? 'Profile complete — Applications unlocked' : 'Complete required fields to unlock applying'}
          </span>
        </div>
        <div className="ip-cp-unlock__grid">
          {unlockItems.map((item) => (
            <div key={item.label} className={`ip-cp-unlock__item${item.done ? ' is-done' : ''}`}>
              {item.done ? <Check /> : <span className="ip-cp-unlock__open" />}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="ip-cp-notice">
          Notice: Mandatory fields are marked with red asterisks (*). Optional fields can be completed at your convenience without blocking application eligibility.
        </p>
      </div>

      <form className="ip-cp-sheet" onSubmit={save}>
        <div className="ip-cp-tabs" role="tablist" aria-label="Profile sections">
          {PROFILE_TABS.map((tab) => {
            const Icon = tab.Icon;
            const selected = profileTab === tab.id;
            const locked = tabIsLocked(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-disabled={locked}
                disabled={locked}
                title={locked ? 'Complete the previous step with Save & Next first' : undefined}
                className={[
                  tab.id === 'history' ? 'is-star' : '',
                  locked ? 'is-locked' : '',
                ].filter(Boolean).join(' ') || undefined}
                onClick={() => selectTab(tab.id)}
              >
                {locked ? <Lock /> : <Icon />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {isWizardTab ? (
          <div className="ip-cp-wizard" aria-label={`Profile setup step ${wizardIndex + 1} of ${WIZARD_ORDER.length}`}>
            <div className="ip-cp-wizard__top">
              <span>Step {wizardIndex + 1} of {WIZARD_ORDER.length}</span>
              <strong>{PROFILE_TABS.find((t) => t.id === profileTab)?.label?.replace(/^\d+\.\s*/, '')}</strong>
            </div>
            <div className="ip-cp-wizard__bar" aria-hidden>
              <div style={{ width: `${((wizardIndex + 1) / WIZARD_ORDER.length) * 100}%` }} />
            </div>
            <p className="ip-cp-wizard__hint">
              Use Save &amp; Next to move through these three steps. Later steps stay locked until you advance.
              Privacy and endorsements stay available in the tabs above.
            </p>
          </div>
        ) : null}

        {profileTab === 'basics' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head">
                <h3>Personal Details</h3>
              </div>
              <div className="ip-cp-grid ip-cp-grid--3">
                <Field label="First Name" required invalid={isMissing('first_name')}>
                  <input className="ip-cp-input" value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} />
                </Field>
                <Field label="Middle Name" optional>
                  <input className="ip-cp-input" value={form.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} />
                </Field>
                <Field label="Last Name" required invalid={isMissing('last_name')}>
                  <input className="ip-cp-input" value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} />
                </Field>
              </div>
            </section>

            <div className="ip-cp-email">
              <div className="ip-cp-email__top">
                <div className="ip-cp-email__label">
                  <Lock />
                  <h4>Current Login Email (Verified)</h4>
                </div>
                <span className="ip-cp-email__badge">Active Login ID</span>
              </div>
              <p className="ip-cp-email__value">{form.account_email || ''}</p>
              <div className="ip-cp-email__change">
                <label className="ip-cp-label" htmlFor="new-login-email-input">Change Login Email Address</label>
                <div className="ip-cp-email__row">
                  <input
                    id="new-login-email-input"
                    className="ip-cp-input"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address (e.g., name.new@vit.edu)"
                  />
                  <button type="button" className="ip-cp-btn ip-cp-btn--primary" onClick={requestEmailCode} disabled={!newEmail}>
                    Send Verification Code
                  </button>
                </div>
              </div>
              {emailStep === 'verify' ? (
                <div className="ip-cp-email__otp">
                  <p>A security verification code was requested for <strong>{newEmail}</strong>. Please enter the verification code:</p>
                  <div className="ip-cp-email__otp-row">
                    <input
                      className="ip-cp-input ip-cp-input--otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                    />
                    <button type="button" className="ip-cp-btn ip-cp-btn--ok" onClick={verifyEmailCode}>
                      Confirm &amp; Update Email
                    </button>
                  </div>
                  <p className="ip-cp-hint">Security Note: Updating your login email will re-route future authentication notifications to your new address.</p>
                </div>
              ) : null}
            </div>

            <section>
              <div className="ip-cp-sec-head"><h3>Contact &amp; Location</h3></div>
              <div className="ip-cp-grid ip-cp-grid--3">
                <Field label="Mobile phone" optional span={2}>
                  <div className="ip-cp-phone" role="group" aria-label="Mobile phone with country code">
                    <select
                      className="ip-cp-phone__dial"
                      value={form.phone_country_code || '+91'}
                      onChange={(e) => {
                        set('phone_country_code', e.target.value);
                        setPhoneError('');
                      }}
                      aria-label="Country calling code"
                    >
                      {PHONE_DIAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`ip-cp-phone__num${phoneError ? ' is-invalid' : ''}`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={form.phone || ''}
                      onChange={(e) => {
                        set('phone', e.target.value);
                        setPhoneError('');
                      }}
                      placeholder="98765 43210"
                      aria-label="Mobile phone number"
                      aria-invalid={phoneError ? 'true' : 'false'}
                    />
                  </div>
                  {phoneError ? <p className="ip-cp-error" role="alert">{phoneError}</p> : null}
                </Field>
                <Field label="Country" required invalid={isMissing('country')}>
                  <select className="ip-cp-input" value={form.country || 'India'} onChange={(e) => set('country', e.target.value)}>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Current City" required invalid={isMissing('city')}>
                  <SearchableSelect
                    options={cityChoices}
                    value={form.city || ''}
                    onChange={(city) => {
                      const hit = findCity(city);
                      setForm((f) => ({
                        ...f,
                        city,
                        state: hit?.state && !/^work mode$/i.test(hit.state) ? hit.state : f.state,
                      }));
                    }}
                    placeholder="Search cities…"
                    ariaLabel="Current city"
                  />
                </Field>
                <Field label="State / Union Territory" required invalid={isMissing('state')}>
                  <SearchableSelect
                    options={stateOptions}
                    value={form.state || ''}
                    onChange={(state) => {
                      setForm((f) => {
                        const hit = findCity(f.city);
                        const cityStillValid =
                          !state
                          || !f.city
                          || (hit && String(hit.state || '').toLowerCase() === String(state).toLowerCase());
                        return { ...f, state, city: cityStillValid ? f.city : '' };
                      });
                    }}
                    placeholder="Search states…"
                    ariaLabel="State or union territory"
                  />
                </Field>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Preferences &amp; Availability</h3></div>
              <div className="ip-cp-grid">
                <Field label="Preferred Work Mode" required invalid={isMissing('preferred_work_mode')}>
                  <select className="ip-cp-input" value={workMode} onChange={(e) => set('preferred_work_mode', e.target.value)}>
                    <option value="" disabled>Select preferred work mode</option>
                    {WORK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    {!knownMode && workMode ? <option value={workMode}>{workMode}</option> : null}
                  </select>
                </Field>
                <Field label="Earliest Availability / Start Date" required invalid={isMissing('availability_date')}>
                  <input
                    className="ip-cp-input"
                    type="date"
                    value={form.availability_date ? String(form.availability_date).slice(0, 10) : ''}
                    onChange={(e) => set('availability_date', e.target.value)}
                  />
                </Field>
                <Field label="Preferred Locations" optional hint="Search and select one or more cities (includes Remote)" span={2}>
                  <SearchableMultiSelect
                    options={cityOptions}
                    value={
                      Array.isArray(form.preferred_locations)
                        ? form.preferred_locations
                        : String(form.preferred_locations || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                    }
                    onChange={(next) => set('preferred_locations', next)}
                    placeholder="Search cities…"
                    ariaLabel="Preferred locations"
                  />
                </Field>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Resume &amp; Portfolio Links</h3></div>
              <div className="ip-cp-stack-sm">
                <Field label="Resume / CV" required hint="Upload a PDF/DOC/DOCX or paste a hosted URL" invalid={isMissing('resume_url')}>
                  <div className="ip-cp-resume-row">
                    <div className="ip-cp-upload-wrap">
                      <IpUploadButton
                        endpoint="/api/ip/candidate/profile/resume/upload"
                        accept={resumeAcceptAttr()}
                        label="Upload resume"
                        onUploaded={(data, file) => {
                          const url = data.resume_url || data.fileUrl;
                          if (url) set('resume_url', url);
                          setResumeFileName(data.fileName || file?.name || resumeDisplayName(url));
                          setMessage('Resume uploaded.');
                        }}
                      />
                    </div>
                    {form.resume_url ? (
                      <div className="ip-cp-resume-file">
                        <span className="ip-cp-resume-file__name" title={form.resume_url}>
                          {resumeDisplayName(form.resume_url, resumeFileName)}
                        </span>
                        <button
                          type="button"
                          className="ip-cp-btn ip-cp-btn--ghost"
                          onClick={() => {
                            set('resume_url', '');
                            setResumeFileName('');
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <input
                        className="ip-cp-input ip-cp-input--mono"
                        type="url"
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          set('resume_url', v);
                          setResumeFileName(resumeDisplayName(v));
                        }}
                        placeholder="Or paste a hosted URL…"
                      />
                    )}
                  </div>
                </Field>

                <div className="ip-cp-link-block">
                  <div className="ip-cp-sec-head ip-cp-sec-head--compact">
                    <div>
                      <h3>Extra CV-related links</h3>
                      <p className="ip-cp-hint">Optional docs, certificates, or alternate CV hosts — separate from LinkedIn/GitHub. Add each link below, then use Save Basics &amp; Contact.</p>
                    </div>
                    <button type="button" className="ip-cp-btn ip-cp-btn--soft" onClick={addResumeLink}>
                      <Plus />
                      + Add link
                    </button>
                  </div>
                  {(Array.isArray(form.resume_links) ? form.resume_links : []).length === 0 ? (
                    <p className="ip-cp-hint">No extra links yet. Use + Add link to add one.</p>
                  ) : (
                    <div className="ip-cp-stack-sm">
                      {(form.resume_links || []).map((link) => (
                        <div key={link.id} className="ip-cp-link-row">
                          <Field label="Title / label" optional>
                            <input
                              className="ip-cp-input"
                              value={link.title || ''}
                              onChange={(e) => updateResumeLink(link.id, { title: e.target.value })}
                              placeholder="e.g. Design portfolio PDF"
                            />
                          </Field>
                          <Field label="URL" optional>
                            <input
                              className="ip-cp-input ip-cp-input--mono"
                              type="url"
                              value={link.url || ''}
                              onChange={(e) => updateResumeLink(link.id, { url: e.target.value })}
                              placeholder="https://"
                            />
                          </Field>
                          <button
                            type="button"
                            className="ip-cp-btn ip-cp-btn--danger-outline"
                            onClick={() => removeResumeLink(link.id)}
                          >
                            Remove link
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {linkDraftError ? <p className="ip-cp-error">{linkDraftError}</p> : null}
                </div>

                <div className="ip-cp-grid">
                  <Field label="LinkedIn Profile URL" optional>
                    <input className="ip-cp-input" type="url" value={form.linkedin_url || ''} onChange={(e) => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/..." />
                  </Field>
                  <Field label="GitHub / Portfolio URL" optional>
                    <input className="ip-cp-input" type="url" value={form.github_url || ''} onChange={(e) => set('github_url', e.target.value)} placeholder="https://github.com/..." />
                  </Field>
                </div>
                <Field label="Personal website" optional>
                  <input className="ip-cp-input" type="url" value={form.personal_website || ''} onChange={(e) => set('personal_website', e.target.value)} placeholder="https://" />
                </Field>
              </div>
            </section>
          </div>
        ) : null}

        {profileTab === 'academic' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head">
                <div>
                  <h3>Academic Education History</h3>
                  <p className="ip-cp-hint">Academic history is flexible. You can add extra degrees or certifications.</p>
                </div>
                <button type="button" className="ip-cp-btn ip-cp-btn--soft" onClick={addAcademicRow}>
                  <Plus />
                  + Add Education Row
                </button>
              </div>
              <div className="ip-cp-stack-sm">
                {academics.map((row, idx) => (
                  <div key={row.id || idx} className="ip-cp-edu">
                    <div className="ip-cp-edu__head">
                      <span className={`ip-cp-pill${idx === 0 ? '' : ' is-outline'}`}>
                        {row.row_label || (idx === 0 ? 'Primary education' : `Education ${idx + 1}`)}
                      </span>
                      {academics.length > 1 ? (
                        <button type="button" className="ip-cp-btn ip-cp-btn--ghost" onClick={() => removeAcademicRow(idx)} aria-label="Remove row">
                          <Trash2 />
                        </button>
                      ) : null}
                    </div>
                    <div className="ip-cp-grid">
                      <Field label="Education label" optional span={2}>
                        <input className="ip-cp-input" value={row.row_label || ''} onChange={(e) => setAcademicField(idx, 'row_label', e.target.value)} placeholder={idx === 0 ? 'Primary education' : `Education ${idx + 1}`} />
                      </Field>
                      <Field label="College / university">
                        <input className="ip-cp-input" value={row.college} onChange={(e) => setAcademicField(idx, 'college', e.target.value)} />
                      </Field>
                      <Field label="Degree">
                        <input className="ip-cp-input" value={row.degree} onChange={(e) => setAcademicField(idx, 'degree', e.target.value)} />
                      </Field>
                      <Field label="Specialization">
                        <input className="ip-cp-input" value={row.specialization} onChange={(e) => setAcademicField(idx, 'specialization', e.target.value)} />
                      </Field>
                      <Field label="Study status">
                        <input className="ip-cp-input" value={row.study_status} onChange={(e) => setAcademicField(idx, 'study_status', e.target.value)} placeholder="Studying / Graduated" />
                      </Field>
                      <Field label="Graduation year">
                        <input className="ip-cp-input" type="number" value={row.graduation_year} onChange={(e) => setAcademicField(idx, 'graduation_year', e.target.value)} />
                      </Field>
                      <Field label="CGPA / percentage">
                        <input className="ip-cp-input" value={row.cgpa} onChange={(e) => setAcademicField(idx, 'cgpa', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head">
                <div>
                  <h3>Technical &amp; Domain Skills <span className="ip-cp-req">*</span> <span className="ip-cp-opt">(Tag-based)</span></h3>
                  <p className="ip-cp-hint">Add skills as tags — recruiters use them to match candidates with posted internships.</p>
                </div>
                <span className="ip-cp-pill">Tag-based</span>
              </div>
              <div className="ip-cp-skills-box">
                <div className="ip-cp-skills">
                  {skills.length ? skills.map((s) => (
                    <button key={s} type="button" className="ip-cp-skill" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`}>
                      {s}
                      <span aria-hidden>×</span>
                    </button>
                  )) : <span className="ip-cp-hint">No skills added yet.</span>}
                </div>
                <div className="ip-cp-skill-add">
                  <input
                    className="ip-cp-input"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkillTag();
                      }
                    }}
                    placeholder="Enter a new skill (e.g. Python, SQL, Docker)"
                  />
                  <button type="button" className="ip-cp-btn ip-cp-btn--primary" onClick={addSkillTag}>+ Add Skill</button>
                </div>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head">
                <div>
                  <h3>Experience <span className="ip-cp-opt">(optional)</span></h3>
                  <p className="ip-cp-hint">Add internships, projects, or jobs as separate cards — clearer than one long paragraph.</p>
                </div>
                <button type="button" className="ip-cp-btn ip-cp-btn--soft" onClick={addExperienceRow}>
                  <Plus />
                  + Add Experience
                </button>
              </div>
              <div className="ip-cp-stack-sm">
                {experiences.map((row, idx) => (
                  <div key={row.id || idx} className="ip-cp-edu ip-cp-exp">
                    <div className="ip-cp-edu__head">
                      <span className={`ip-cp-pill${idx === 0 ? '' : ' is-outline'}`}>
                        Experience {idx + 1}
                      </span>
                      {experiences.length > 1 ? (
                        <button type="button" className="ip-cp-btn ip-cp-btn--ghost" onClick={() => removeExperienceRow(idx)} aria-label="Remove experience">
                          <Trash2 />
                        </button>
                      ) : null}
                    </div>
                    <div className="ip-cp-grid">
                      <Field label="Role / title">
                        <input className="ip-cp-input" value={row.title} onChange={(e) => setExperienceField(idx, 'title', e.target.value)} placeholder="Frontend intern" />
                      </Field>
                      <Field label="Organization">
                        <input className="ip-cp-input" value={row.organization} onChange={(e) => setExperienceField(idx, 'organization', e.target.value)} placeholder="Company or project" />
                      </Field>
                      <Field label="Start">
                        <input className="ip-cp-input" value={row.start} onChange={(e) => setExperienceField(idx, 'start', e.target.value)} placeholder="Jun 2025" />
                      </Field>
                      <Field label="End">
                        <input className="ip-cp-input" value={row.end} onChange={(e) => setExperienceField(idx, 'end', e.target.value)} placeholder="Aug 2025 or Present" />
                      </Field>
                      <Field label="What you did" optional span={2}>
                        <textarea
                          className="ip-cp-textarea"
                          rows={3}
                          value={row.description}
                          onChange={(e) => setExperienceField(idx, 'description', e.target.value)}
                          placeholder="One bullet per line works well."
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {profileTab === 'readiness' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head"><h3>Work Readiness Preferences</h3></div>
              <div className="ip-cp-grid">
                <label className="ip-cp-toggle-card">
                  <span>
                    <strong>Immediate Start Availability</strong>
                    <small>Can begin work within 7 days of selection</small>
                  </span>
                  <input type="checkbox" checked={!!form.immediate_start} onChange={(e) => set('immediate_start', e.target.checked)} />
                </label>
                <label className="ip-cp-toggle-card">
                  <span>
                    <strong>Relocation Willingness</strong>
                    <small>Willing to move for on-site roles</small>
                  </span>
                  <input type="checkbox" checked={!!form.willing_to_relocate} onChange={(e) => set('willing_to_relocate', e.target.checked)} />
                </label>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Setup &amp; hours</h3></div>
              <p className="ip-cp-hint">All questions below are optional — answer only what you are comfortable sharing.</p>
              <div className="ip-cp-grid">
                <Field label="Wired or Wi-Fi broadband?" hint="Not mobile 4G/5G hotspot only.">
                  <select
                    className="ip-cp-input"
                    value={form.has_wired_broadband === true ? 'yes' : form.has_wired_broadband === false ? 'no' : ''}
                    onChange={(e) => set('has_wired_broadband', e.target.value === '' ? null : e.target.value === 'yes')}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Dedicated laptop available?" hint="A laptop that is regularly available for your work.">
                  <select
                    className="ip-cp-input"
                    value={form.has_dedicated_laptop === true ? 'yes' : form.has_dedicated_laptop === false ? 'no' : ''}
                    onChange={(e) => set('has_dedicated_laptop', e.target.value === '' ? null : e.target.value === 'yes')}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Preferred working hours range" hint="Availability window (when you can work), not total hours." span={2}>
                  <div className="ip-cp-time-row">
                    <input className="ip-cp-input" type="time" value={form.preferred_hours_start || ''} onChange={(e) => set('preferred_hours_start', e.target.value)} />
                    <span>to</span>
                    <input className="ip-cp-input" type="time" value={form.preferred_hours_end || ''} onChange={(e) => set('preferred_hours_end', e.target.value)} />
                  </div>
                </Field>
                <Field label="Ongoing commitment?" hint="Another internship, offline classes, or similar." span={2}>
                  <select className="ip-cp-input" value={form.ongoing_commitment_choice || ''} onChange={(e) => set('ongoing_commitment_choice', e.target.value)}>
                    {COMMITMENT_OPTIONS.map((opt) => (
                      <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
                {form.ongoing_commitment_choice === 'other' ? (
                  <Field label="Commitment note" optional span={2}>
                    <input className="ip-cp-input" value={form.ongoing_commitment_note || ''} onChange={(e) => set('ongoing_commitment_note', e.target.value)} placeholder="e.g. evening classes Mon–Wed" />
                  </Field>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {profileTab === 'privacy' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head"><h3>Profile Photo</h3></div>
              <div className="ip-cp-photo">
                <div className="ip-cp-photo__preview">
                  {form.profile_picture_url && form.show_profile_picture !== false ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.profile_picture_url} alt="" />
                  ) : (
                    <span>{initialsFrom(form)}</span>
                  )}
                </div>
                <div>
                  <p>Upload a professional headshot (JPG, PNG. Max 2MB).</p>
                  <div className="ip-cp-photo__actions">
                    <label className="ip-cp-btn ip-cp-btn--outline ip-cp-btn--file">
                      <span>Choose File</span>
                      <input type="file" accept={imageAcceptAttr()} className="ip-cp-sr" onChange={onPhotoFile} />
                    </label>
                    <span className="ip-cp-hint">{photoStatus}</span>
                  </div>
                  <label className="ip-cp-check ip-cp-check--inline">
                    <input
                      type="checkbox"
                      checked={form.show_profile_picture !== false}
                      onChange={(e) => set('show_profile_picture', e.target.checked)}
                    />
                    <span>Display my profile picture to employers</span>
                  </label>
                </div>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Privacy &amp; Contact Visibility</h3></div>
              <div className="ip-cp-stack-sm">
                <label className="ip-cp-toggle-card ip-cp-toggle-card--white">
                  <span>
                    <strong>Public Recruiter Searchability</strong>
                    <small>Allow verified recruiters to discover your profile</small>
                  </span>
                  <input type="checkbox" checked={!!form.searchable} onChange={(e) => set('searchable', e.target.checked)} />
                </label>
                <label className="ip-cp-toggle-card ip-cp-toggle-card--white">
                  <span>
                    <strong>Hide Phone Number Until Shortlist</strong>
                    <small>Only reveal mobile number to employers after an offer or interview invitation</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.hide_phone_until_shortlist !== false}
                    onChange={(e) => set('hide_phone_until_shortlist', e.target.checked)}
                  />
                </label>
                <label className="ip-cp-toggle-card ip-cp-toggle-card--white">
                  <span>
                    <strong>Show completed internships</strong>
                    <small>Let employers see completed internships and ratings</small>
                  </span>
                  <input type="checkbox" checked={!!form.show_completed_internships} onChange={(e) => set('show_completed_internships', e.target.checked)} />
                </label>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head">
                <h3>Instant Messaging Alerts <span className="ip-cp-opt">(optional)</span></h3>
                <span className="ip-cp-pill is-muted">Optional Channels</span>
              </div>
              <p className="ip-cp-hint">Opt-in to receive status updates for interview schedules and offer letters via instant messaging.</p>
              <div className="ip-cp-grid">
                <Field label="WhatsApp number" optional>
                  <input className="ip-cp-input" type="tel" value={form.whatsapp_number || ''} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="+91 98765 43210" />
                </Field>
                <Field label="Telegram handle" optional>
                  <input className="ip-cp-input" value={form.telegram_handle || ''} onChange={(e) => set('telegram_handle', e.target.value)} placeholder="@handle" />
                </Field>
                <label className={`ip-cp-toggle-card is-wa${!waReady ? ' is-disabled' : ''}`}>
                  <span className="ip-cp-im">
                    <span className="ip-cp-im__badge is-wa">WA</span>
                    <span>
                      <strong>WhatsApp Updates</strong>
                      <small>Requires verified mobile phone number</small>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!form.whatsapp_opt_in}
                    onChange={(e) => set('whatsapp_opt_in', e.target.checked)}
                    disabled={!waReady}
                  />
                </label>
                <label className={`ip-cp-toggle-card is-tg${!tgReady ? ' is-disabled' : ''}`}>
                  <span className="ip-cp-im">
                    <span className="ip-cp-im__badge is-tg">TG</span>
                    <span>
                      <strong>Telegram Bot Notifications</strong>
                      <small>Optional secondary alert channel</small>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!form.telegram_opt_in}
                    onChange={(e) => set('telegram_opt_in', e.target.checked)}
                    disabled={!tgReady}
                  />
                </label>
              </div>
            </section>
          </div>
        ) : null}

        {profileTab === 'history' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <div className="ip-cp-note">
              <Info />
              <div>
                <h3>Employer Endorsements (Read-Only)</h3>
                <p>Endorsements are issued directly by verified supervisors following completed internships. Candidates cannot create or edit endorsement records.</p>
              </div>
            </div>
            {endorsements.length ? endorsements.map((e) => (
              <div key={e.id} className="ip-cp-endorsement">
                <div className="ip-cp-endorsement__top">
                  <div>
                    <h4>{e.company_name || 'Employer'}</h4>
                    <p>{[e.role_title || 'Internship', e.period_label].filter(Boolean).join(' • ')}</p>
                  </div>
                  {e.rating_excerpt ? <span className="ip-cp-endorsement__star">★ {e.rating_excerpt}</span> : null}
                </div>
                {e.certificate_text ? <p className="ip-cp-endorsement__quote">{e.certificate_text}</p> : null}
                {e.skills_endorsed?.length ? (
                  <div className="ip-cp-skills">
                    {e.skills_endorsed.map((s) => <span key={s} className="ip-cp-skill is-static">{s}</span>)}
                  </div>
                ) : null}
                <div className="ip-cp-endorsement__foot">
                  <span className="ip-cp-pill is-ok">Verified Completion Certificate</span>
                </div>
              </div>
            )) : <div className="ip-cp-empty">No endorsements or completed internships yet.</div>}
          </div>
        ) : null}

        {profileTab !== 'history' ? (
          <div className="ip-cp-save">
            {saveError ? (
              <p className="ip-cp-save__error" role="alert">{saveError}</p>
            ) : missingRequired.length ? (
              <p className="ip-cp-save__error" role="status">
                Saved. Still blank (needed to unlock applying): {missingRequired.map((f) => f.label).join(', ')}
              </p>
            ) : (
              <p>You can save your progress even if some optional fields are blank.</p>
            )}
            <div className="ip-cp-save__actions">
              {isWizardTab && wizardIndex > 0 ? (
                <button type="button" className="ip-cp-btn ip-cp-btn--outline" onClick={() => goWizard(-1)}>
                  Back
                </button>
              ) : null}
              <button type="submit" className="ip-cp-btn ip-cp-btn--primary" disabled={saving}>
                {saving ? 'Saving...' : activeTab?.saveLabel || 'Save profile'}
              </button>
              {isWizardTab && wizardIndex < WIZARD_ORDER.length - 1 ? (
                <button
                  type="button"
                  className="ip-cp-btn ip-cp-btn--soft"
                  disabled={saving}
                  onClick={async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const fromIdx = WIZARD_ORDER.indexOf(profileTab);
                    const ok = await save();
                    if (!ok) return;
                    const nextIdx = Math.min(fromIdx + 1, WIZARD_ORDER.length - 1);
                    const next = WIZARD_ORDER[nextIdx];
                    setWizardUnlockedThru((u) => Math.max(u, nextIdx));
                    if (next) {
                      setProfileTab(next);
                      setMessage((prev) => prev || `${PROFILE_TABS.find((t) => t.id === next)?.label || 'Next step'} — continue here.`);
                      try {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                >
                  Save &amp; Next
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <div className="ip-cp-export">
        <div>
          <div className="ip-cp-export__title">
            <Download />
            <h3>Export Candidate Profile Data (.csv)</h3>
          </div>
          <p>Download a privacy-compliant summary of your basic profile, academic records, and skills history.</p>
        </div>
        <a className="ip-cp-btn ip-cp-btn--outline" href="/api/ip/candidate/export">
          <Download />
          Download Excel (.csv)
        </a>
      </div>
    </div>
  );
}
