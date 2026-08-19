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
import { imageAcceptAttr } from '@/lib/ipFileUpload';
import '@/components/ip/ip-candidate-profile-gemini.css';

const PROFILE_TABS = [
  { id: 'basics', label: '1. Basics & Contact', Icon: User, saveLabel: 'Save Basics & Contact' },
  { id: 'academic', label: '2. Academic & Skills', Icon: GraduationCap, saveLabel: 'Save Academic & Skills' },
  { id: 'readiness', label: '3. Work Readiness', Icon: Briefcase, saveLabel: 'Save Work Readiness' },
  { id: 'privacy', label: '4. Privacy & Photo', Icon: Lock, saveLabel: 'Save Privacy Settings' },
  { id: 'history', label: '5. Endorsements (Read-Only)', Icon: Star },
];

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

function Field({ label, hint, required, optional, children, span }) {
  return (
    <div className={`ip-cp-field${span === 2 ? ' ip-cp-span-2' : ''}${span === 3 ? ' ip-cp-span-3' : ''}`}>
      <label className="ip-cp-label">
        {label}
        {required ? <span className="ip-cp-req"> *</span> : null}
        {optional ? <span className="ip-cp-opt"> (optional)</span> : null}
      </label>
      {hint ? <p className="ip-cp-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export default function CandidateProfilePage() {
  const [form, setForm] = useState(null);
  const [academics, setAcademics] = useState([emptyAcademicRow()]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [endorsements, setEndorsements] = useState([]);
  const [profileTab, setProfileTab] = useState('basics');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState('idle');
  const [newSkill, setNewSkill] = useState('');
  const [photoStatus, setPhotoStatus] = useState('No file selected');

  useEffect(() => {
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => setForm(d.profile));
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

  async function saveProfileBody() {
    const payload = {
      ...form,
      skills,
      preferred_locations: typeof form.preferred_locations === 'string'
        ? form.preferred_locations.split(',').map((s) => s.trim()).filter(Boolean)
        : form.preferred_locations,
    };
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      let data = {};
      if (profileTab === 'academic') {
        const res = await fetch('/api/ip/candidate/academics', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: academics }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save academics');
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
    } catch (err) {
      setMessage(err.message);
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
      { label: 'Mobile Phone *', done: Boolean(form.phone) },
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
      Boolean(form.phone),
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
      Boolean(form.prior_experience),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, collegeDone, skills.length]);

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
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={tab.id === 'history' ? 'is-star' : undefined}
                onClick={() => setProfileTab(tab.id)}
              >
                <Icon />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {profileTab === 'basics' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head">
                <h3>Personal Details</h3>
              </div>
              <div className="ip-cp-grid ip-cp-grid--3">
                <Field label="First Name" required>
                  <input className="ip-cp-input" value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} />
                </Field>
                <Field label="Middle Name" optional>
                  <input className="ip-cp-input" value={form.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} />
                </Field>
                <Field label="Last Name" required>
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
                <Field label="Country Code" required>
                  <select className="ip-cp-input" value={form.phone_country_code || '+91'} onChange={(e) => set('phone_country_code', e.target.value)}>
                    <option value="+91">India (+91)</option>
                    <option value="+1">United States (+1)</option>
                    <option value="+44">United Kingdom (+44)</option>
                    <option value="+65">Singapore (+65)</option>
                    <option value="+971">United Arab Emirates (+971)</option>
                    <option value="+61">Australia (+61)</option>
                  </select>
                </Field>
                <Field label="Mobile Phone Number" required>
                  <input className="ip-cp-input" type="tel" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
                </Field>
                <Field label="Country" required>
                  <select className="ip-cp-input" value={form.country || 'India'} onChange={(e) => set('country', e.target.value)}>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Current City" required>
                  <input className="ip-cp-input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <Field label="State / Union Territory" required>
                  <input className="ip-cp-input" value={form.state || ''} onChange={(e) => set('state', e.target.value)} />
                </Field>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Preferences &amp; Availability</h3></div>
              <div className="ip-cp-grid">
                <Field label="Preferred Work Mode" required>
                  <select className="ip-cp-input" value={workMode} onChange={(e) => set('preferred_work_mode', e.target.value)}>
                    <option value="" disabled>Select preferred work mode</option>
                    {WORK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    {!knownMode && workMode ? <option value={workMode}>{workMode}</option> : null}
                  </select>
                </Field>
                <Field label="Earliest Availability / Start Date" required>
                  <input
                    className="ip-cp-input"
                    type="date"
                    value={form.availability_date ? String(form.availability_date).slice(0, 10) : ''}
                    onChange={(e) => set('availability_date', e.target.value)}
                  />
                </Field>
                <Field label="Preferred Locations" optional hint="comma-separated Indian cities" span={2}>
                  <input
                    className="ip-cp-input"
                    value={Array.isArray(form.preferred_locations) ? form.preferred_locations.join(', ') : form.preferred_locations || ''}
                    onChange={(e) => set('preferred_locations', e.target.value)}
                    placeholder="Bengaluru, Pune, Hyderabad, Remote"
                  />
                </Field>
              </div>
            </section>

            <section>
              <div className="ip-cp-sec-head"><h3>Resume &amp; Portfolio Links</h3></div>
              <div className="ip-cp-stack-sm">
                <Field label="Resume / CV URL (PDF Hosted)" required>
                  <input className="ip-cp-input ip-cp-input--mono" type="url" value={form.resume_url || ''} onChange={(e) => set('resume_url', e.target.value)} placeholder="https://" />
                </Field>
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
                  <h3>Technical &amp; Domain Skills <span className="ip-cp-req">*</span></h3>
                  <p className="ip-cp-hint">Skills are used by recruiters to match candidates with posted internships.</p>
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
          </div>
        ) : null}

        {profileTab === 'readiness' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section>
              <div className="ip-cp-sec-head">
                <h3>Internship &amp; Project Experience <span className="ip-cp-opt">(optional)</span></h3>
              </div>
              <p className="ip-cp-hint">Summarize prior internships, academic capstones, or notable open-source projects.</p>
              <textarea
                className="ip-cp-textarea"
                rows={4}
                value={form.prior_experience || ''}
                onChange={(e) => set('prior_experience', e.target.value)}
                placeholder="e.g. Built a REST API using Node.js and PostgreSQL during a summer internship."
              />
            </section>

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
            <p>You can save your progress even if some optional fields are blank.</p>
            <button type="submit" className="ip-cp-btn ip-cp-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : activeTab?.saveLabel || 'Save profile'}
            </button>
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
