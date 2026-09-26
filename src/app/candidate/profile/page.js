'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Check,
  Download,
  GraduationCap,
  Info,
  Lock,
  Plus,
  Shield,
  Sparkles,
  Star,
  Trash2,
  User,
} from 'lucide-react';
import { imageAcceptAttr, resumeAcceptAttr } from '@/lib/ipFileUpload';
import { validateRequiredPhone, phoneDialOptionsFor } from '@/lib/ipPhoneValidation';
import IpUploadButton from '@/components/ip/IpUploadButton';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import SearchableSelect from '@/components/ip/SearchableSelect';
import useIpCityCatalog from '@/hooks/useIpCityCatalog';
import useIpCountryCatalog from '@/hooks/useIpCountryCatalog';
import {
  emptyExperience,
  parseExperienceEntries,
  serializeExperienceEntries,
} from '@/lib/ipPostingBody';
import {
  clearProfileDraft,
  PROFILE_DRAFT_RESTORE_MESSAGE,
  profileDraftDiffersFromServer,
  profileDraftFingerprint,
  readProfileDraft,
  writeProfileDraft,
} from '@/lib/ipCandidateProfileDraft';
import { preferredRolesToText } from '@/lib/ipPreferredRoles';
import '@/components/ip/ip-candidate-profile-gemini.css';

const PROFILE_TABS = [
  { id: 'basics', label: '1. Basics & Contact', Icon: User, saveLabel: 'Save Basics & Contact', wizardStep: 1 },
  { id: 'academic', label: '2. Academic', Icon: GraduationCap, saveLabel: 'Save Academic', wizardStep: 2 },
  { id: 'skills', label: '3. Skills & Experience', Icon: Sparkles, saveLabel: 'Save Skills & Experience', wizardStep: 3 },
  { id: 'readiness', label: '4. Work Readiness', Icon: Briefcase, saveLabel: 'Save Work Readiness', wizardStep: 4 },
  { id: 'privacy', label: '5. Privacy & Photo', Icon: Lock, saveLabel: 'Save Privacy Settings' },
  { id: 'history', label: '6. Endorsements (Read-Only)', Icon: Star },
];

const WIZARD_ORDER = ['basics', 'academic', 'skills', 'readiness'];

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];

const COMMITMENT_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'none', label: 'No — no other commitments' },
  { value: 'other_internship', label: 'Yes — another internship' },
  { value: 'offline_classes', label: 'Yes — offline / college classes' },
  { value: 'part_time_work', label: 'Yes — part-time job or other work' },
  { value: 'other', label: 'Yes — other (use note)' },
];

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
  { key: 'phone', label: 'Mobile phone' },
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
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [academics, setAcademics] = useState([emptyAcademicRow()]);
  const [experiences, setExperiences] = useState([emptyExperience()]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [endorsements, setEndorsements] = useState([]);
  const [profileTab, setProfileTab] = useState('basics');
  /** Highest wizard step index the user may open (0=basics). Advanced by Save & Next. */
  const [wizardUnlockedThru, setWizardUnlockedThru] = useState(0);
  const [newSkill, setNewSkill] = useState('');
  const [photoStatus, setPhotoStatus] = useState('No file selected');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoImgFailed, setPhotoImgFailed] = useState(false);
  const photoInputRef = useRef(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  /** Save failures must show next to the buttons; the top alert is off-screen from the save row. */
  const [saveError, setSaveError] = useState('');
  /** Turns on red highlighting for blank required fields once the user has tried to save. */
  const [showMissing, setShowMissing] = useState(false);
  /** Scroll target after quality-score action switches tab (section id). */
  const [pendingScrollId, setPendingScrollId] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  /** True when UI is showing local draft that is not yet on the account. */
  const [draftNotOnAccount, setDraftNotOnAccount] = useState(false);
  const serverFingerprintRef = useRef('');
  const { cityOptions, placeCityOptions, stateOptions, findCity, loading: citiesLoading } = useIpCityCatalog();
  const { countryOptions, loading: countriesLoading } = useIpCountryCatalog();
  const cityChoices = useMemo(() => {
    const needle = String(form?.state || '').trim().toLowerCase();
    if (!needle) return placeCityOptions;
    return placeCityOptions.filter((o) => String(o.state || '').trim().toLowerCase() === needle);
  }, [placeCityOptions, form?.state]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/ip/candidate/profile').then((r) => r.json()),
      fetch('/api/ip/candidate/academics').then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([d, acad]) => {
      if (cancelled) return;
      let nextForm = d.profile;
      let nextAcademics = (acad.items || []).map((a) => ({
        id: a.id,
        row_label: a.row_label || '',
        college: a.college || '',
        degree: a.degree || '',
        specialization: a.specialization || '',
        study_status: a.study_status || '',
        graduation_year: a.graduation_year || '',
        cgpa: a.cgpa || '',
      }));
      if (!nextAcademics.length) nextAcademics = [emptyAcademicRow()];
      let nextExperiences = parseExperienceEntries(d.profile?.prior_experience);
      serverFingerprintRef.current = profileDraftFingerprint(
        d.profile,
        nextAcademics,
        nextExperiences,
      );
      const userId = d.profile?.user_id;
      const draft = readProfileDraft(userId, d.profile?.account_email);
      const hasUnsavedDraft = profileDraftDiffersFromServer(
        draft,
        d.profile,
        nextAcademics,
        nextExperiences,
      );
      if (hasUnsavedDraft && draft?.form) {
        // Draft must not blank out account-side uploads (photo/resume live in S3 + DB).
        const draftForm = { ...draft.form };
        if (!String(draftForm.profile_picture_url || '').trim()) delete draftForm.profile_picture_url;
        if (!String(draftForm.resume_url || '').trim()) delete draftForm.resume_url;
        nextForm = { ...nextForm, ...draftForm };
        if (Array.isArray(draft.academics) && draft.academics.length) nextAcademics = draft.academics;
        if (Array.isArray(draft.experiences) && draft.experiences.length) nextExperiences = draft.experiences;
        setDraftNotOnAccount(true);
        setMessage(PROFILE_DRAFT_RESTORE_MESSAGE);
      } else {
        setDraftNotOnAccount(false);
      }
      setForm(nextForm);
      setPhotoStatus(nextForm?.profile_picture_url ? 'Photo on file' : 'No file selected');
      setResumeFileName(resumeDisplayName(nextForm?.resume_url));
      setExperiences(nextExperiences);
      setAcademics(nextAcademics);
      if (nextForm?.profile_complete) {
        setWizardUnlockedThru(WIZARD_ORDER.length - 1);
      }
      setDraftReady(true);
    }).catch(() => setDraftReady(true));
    fetch('/api/ip/endorsements')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setEndorsements(d.items || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!draftReady || !form?.user_id) return undefined;
    const t = setTimeout(() => {
      writeProfileDraft(form.user_id, { form, academics, experiences });
      const dirty =
        profileDraftFingerprint(form, academics, experiences) !== serverFingerprintRef.current;
      if (dirty) {
        setDraftNotOnAccount(true);
        setMessage((prev) => (prev && prev !== PROFILE_DRAFT_RESTORE_MESSAGE ? prev : PROFILE_DRAFT_RESTORE_MESSAGE));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draftReady, form, academics, experiences]);

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
    const dial = form.phone_country_code || '+91';
    // Draft (local) may omit phone; account Save always requires a valid phone.
    const phoneCheck = validateRequiredPhone(form.phone, dial);
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
      preferred_roles: preferredRolesToText(form.preferred_roles),
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
    if (!res.ok) {
      throw new Error(
        data.error || "We couldn't save your profile just now. Please check your connection and try again.",
      );
    }
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
      let academicsForFingerprint = academics;
      if (profileTab === 'academic') {
        const res = await fetch('/api/ip/candidate/academics', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: academics }),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || "We couldn't save your education details just now. Please try again.",
          );
        }
        if (Array.isArray(data.items) && data.items.length) {
          academicsForFingerprint = data.items.map((a) => ({
            id: a.id,
            row_label: a.row_label || '',
            college: a.college || '',
            degree: a.degree || '',
            specialization: a.specialization || '',
            study_status: a.study_status || '',
            graduation_year: a.graduation_year || '',
            cgpa: a.cgpa || '',
          }));
          setAcademics(academicsForFingerprint);
        }
        data = await saveProfileBody();
      } else {
        data = await saveProfileBody();
      }
      setForm((current) => (current ? { ...current, profile_complete: data.profileComplete } : current));
      if (data.profileComplete) {
        setWizardUnlockedThru(WIZARD_ORDER.length - 1);
      }
      clearProfileDraft(form?.user_id);
      setDraftNotOnAccount(false);
      serverFingerprintRef.current = profileDraftFingerprint(form, academicsForFingerprint, experiences);
      setMessage(
        data.profileComplete
          ? 'Profile saved — applications unlocked. All profile tabs stay open.'
          : `${PROFILE_TABS.find((tab) => tab.id === profileTab)?.label || 'Profile'} saved.`
      );
      return true;
    } catch (err) {
      const text = err?.message || 'Could not save. Please try again.';
      setMessage(text);
      setSaveError(`Not saved — ${text}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onPhotoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (photoPreview) {
      try {
        URL.revokeObjectURL(photoPreview);
      } catch {
        /* ignore */
      }
    }
    const localUrl = URL.createObjectURL(file);
    setPhotoPreview(localUrl);
    setPhotoBusy(true);
    setPhotoStatus('Uploading…');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/api/ip/candidate/profile/photo/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.hint || 'Upload failed');
      const url = String(data.profile_picture_url || data.fileUrl || '').trim();
      if (!url) throw new Error('Upload finished but no photo URL was returned. Please try again.');
      setForm((f) => ({
        ...f,
        profile_picture_url: url,
        show_profile_picture: true,
      }));
      setPhotoImgFailed(false);
      setPhotoStatus(file.name);
      setMessage('Photo uploaded. Employers see it when “Display my profile picture” is on.');
      // Drop blob once the account URL is known (keep blob until then for preview).
      try {
        URL.revokeObjectURL(localUrl);
      } catch {
        /* ignore */
      }
      setPhotoPreview('');
    } catch (err) {
      setPhotoStatus('Upload failed');
      setMessage(err.message || 'Upload failed');
    } finally {
      setPhotoBusy(false);
    }
  }

  const workMode = form?.preferred_work_mode || '';
  const knownMode = WORK_MODES.includes(workMode);
  const collegeDone = Boolean((academics[0]?.college || form?.college) && (academics[0]?.degree || form?.degree));
  const unlockItems = useMemo(() => {
    if (!form) return [];
    /** Checklist = major completion units (not every form field). Form still shows name/country/city/state separately. */
    const basicInfoDone = Boolean(
      form.first_name
      && form.last_name
      && form.country
      && form.city
      && form.state,
    );
    return [
      { label: 'Basic Information *', done: basicInfoDone },
      { label: 'Mobile Phone *', done: Boolean(form.phone) },
      { label: 'College / Edu *', done: collegeDone },
      { label: 'Resume / CV *', done: Boolean(form.resume_url) },
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
      Boolean(preferredRolesToText(form.preferred_roles)),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, collegeDone, skills.length, experiences]);

  const qualityNextActions = useMemo(() => {
    if (!form) return [];
    const actions = [];
    if (!(form.first_name && form.last_name)) {
      actions.push({ label: 'Add your full name', tab: 'basics', scrollId: 'ip-cp-basics-contact' });
    }
    if (!form.resume_url) {
      actions.push({ label: 'Upload or link a resume', tab: 'basics', scrollId: 'ip-cp-resume' });
    }
    if (!skills.length) {
      actions.push({ label: 'Add key skills', tab: 'skills', scrollId: 'ip-cp-skills' });
    }
    if (!form.phone) {
      actions.push({ label: 'Add mobile phone', tab: 'basics', scrollId: 'ip-cp-basics-contact' });
    }
    if (!form.preferred_work_mode) {
      actions.push({ label: 'Set preferred work mode', tab: 'basics', scrollId: 'ip-cp-preferences' });
    }
    if (!preferredRolesToText(form.preferred_roles)) {
      actions.push({ label: 'Add preferred roles / interests', tab: 'basics', scrollId: 'ip-cp-preferences' });
    }
    if (!form.availability_date) {
      actions.push({ label: 'Set earliest availability', tab: 'basics', scrollId: 'ip-cp-preferences' });
    }
    if (!(form.linkedin_url || form.github_url || form.personal_website)) {
      actions.push({ label: 'Add LinkedIn or portfolio link', tab: 'basics', scrollId: 'ip-cp-social-links' });
    }
    if (!form.profile_picture_url) {
      actions.push({ label: 'Add a profile photo', tab: 'privacy', scrollId: 'ip-cp-photo' });
    }
    return actions.slice(0, 4);
  }, [form, skills.length]);

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
    // After minimum profile is complete (apply unlocked), keep all tabs open — including on refresh.
    if (form?.profile_complete) return false;
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

  function goQualityAction(action) {
    // Quality-score CTAs must land on the field they name. Wizard lock would otherwise
    // leave "Add key skills" looking broken while the user is still on Basics.
    const targetIdx = WIZARD_ORDER.indexOf(action.tab);
    if (targetIdx >= 0) {
      setWizardUnlockedThru((u) => Math.max(u, targetIdx));
    }
    setMessage('');
    setProfileTab(action.tab);
    if (action.scrollId) setPendingScrollId(action.scrollId);
  }

  function goWizard(delta) {
    const next = WIZARD_ORDER[wizardIndex + delta];
    if (next) setProfileTab(next);
  }

  useEffect(() => {
    if (!pendingScrollId || !form) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(pendingScrollId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = el.querySelector('input, select, textarea, button.ip-sms-input, .ip-sms-input');
        if (focusable && typeof focusable.focus === 'function') {
          try { focusable.focus({ preventScroll: true }); } catch { /* ignore */ }
        }
      }
      setPendingScrollId('');
    }, 120);
    return () => clearTimeout(t);
  }, [pendingScrollId, profileTab, form]);
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
  const hasNextStep = isWizardTab && wizardIndex < WIZARD_ORDER.length - 1;
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
              <span>Profile Quality Score</span>
              <strong>{completion}%</strong>
            </div>
            <p>Detail completeness • <em>Distinct from role match % · does not change apply unlock rules</em></p>
            {qualityNextActions.length ? (
              <ul className="ip-cp-quality-next">
                {qualityNextActions.map((a) => (
                  <li key={a.label}>
                    <button type="button" className="ip-cp-quality-next__btn" onClick={() => goQualityAction(a)}>
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ip-cp-quality-done">Looking strong — keep skills and preferences updated.</p>
            )}
          </div>
        </div>
      </div>

      {message ? (
        <div
          className={`ip-cp-alert${draftNotOnAccount || message === PROFILE_DRAFT_RESTORE_MESSAGE ? ' ip-cp-alert--draft' : ''}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

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
              {unlocked
                ? 'Your profile meets the minimum for applying — all sections stay open. Use the tabs freely.'
                : 'First-time setup: use Save & Next through these three steps. Later steps stay locked until you advance. After you unlock applying, all tabs stay open on refresh. Privacy and endorsements stay available above.'}
            </p>
          </div>
        ) : null}

        {profileTab === 'basics' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section id="ip-cp-basics-contact">
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

            <section>
              <div className="ip-cp-sec-head"><h3>Contact &amp; Location</h3></div>
              <div className="ip-cp-grid ip-cp-grid--3">
                <Field label="Mobile phone" required span={2} invalid={Boolean(phoneError) || isMissing('phone')}>
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
                      {phoneDialOptionsFor(form.phone_country_code).map((opt) => (
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
                      required
                    />
                  </div>
                  {phoneError ? <p className="ip-cp-error" role="alert">{phoneError}</p> : null}
                </Field>
                <Field label="Country" required invalid={isMissing('country')}>
                  <SearchableMultiSelect
                    options={countryOptions}
                    value={form.country ? [form.country] : ['India']}
                    onChange={(next) => {
                      const pick = next.length ? next[next.length - 1] : 'India';
                      set('country', pick);
                    }}
                    placeholder="Search countries…"
                    ariaLabel="Country"
                    emptyHint="No countries"
                    loading={countriesLoading && !(countryOptions || []).length}
                  />
                </Field>
                <Field label="Current City" required invalid={isMissing('city')}>
                  <SearchableSelect
                    options={cityChoices}
                    value={form.city || ''}
                    loading={citiesLoading && !(cityChoices || []).length}
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
                    loading={citiesLoading && !(stateOptions || []).length}
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

            <section id="ip-cp-preferences">
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
                    loading={citiesLoading && !(cityOptions || []).length}
                    placeholder="Search cities…"
                    ariaLabel="Preferred locations"
                  />
                </Field>
                <Field
                  label="Preferred Roles / Interests"
                  optional
                  hint="Free text — roles, interests, or a short note. Used to soft-match Recommended internships."
                  span={2}
                >
                  <textarea
                    className="ip-cp-input ip-cp-textarea"
                    rows={3}
                    value={preferredRolesToText(form.preferred_roles)}
                    onChange={(e) => set('preferred_roles', e.target.value)}
                    placeholder="e.g. Marketing and brand work, backend APIs, UI/UX for mobile apps…"
                    aria-label="Preferred roles and interests"
                  />
                </Field>
              </div>
            </section>

            <section id="ip-cp-resume">
              <div className="ip-cp-sec-head"><h3>Resume &amp; Portfolio</h3></div>
              <div className="ip-cp-stack-sm">
                <Field label="Resume / CV" required hint="Upload a PDF, DOC, or DOCX (max size per upload rules)." invalid={isMissing('resume_url')}>
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
                      <p className="ip-cp-hint">No resume uploaded yet.</p>
                    )}
                  </div>
                </Field>

                <div id="ip-cp-social-links" className="ip-cp-grid">
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
          </div>
        ) : null}

        {profileTab === 'skills' ? (
          <div className="ip-cp-stack" role="tabpanel">
            <section id="ip-cp-skills">
              <div className="ip-cp-sec-head">
                <div>
                  <h3>Technical &amp; Domain Skills <span className="ip-cp-req">*</span> <span className="ip-cp-opt">(Tag-based)</span></h3>
                  <p className="ip-cp-hint">Add skills as tags — recruiters use them to match candidates with posted internships.</p>
                </div>
                <span className="ip-cp-pill">Tag-Based</span>
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
            <section id="ip-cp-photo">
              <div className="ip-cp-sec-head"><h3>Profile Photo</h3></div>
              <div className="ip-cp-photo">
                <button
                  type="button"
                  className="ip-cp-photo__preview"
                  disabled={photoBusy}
                  title="Upload new logo."
                  aria-label="Upload new logo."
                  data-tip="Upload new logo."
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoPreview || (form.profile_picture_url && !photoImgFailed) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photoPreview || form.profile_picture_url}
                      src={photoPreview || form.profile_picture_url}
                      alt=""
                      onError={() => {
                        if (!photoPreview) setPhotoImgFailed(true);
                      }}
                    />
                  ) : (
                    <span>{initialsFrom(form)}</span>
                  )}
                </button>
                <div>
                  <p>Upload a professional headshot (JPG, PNG. Max 2MB).</p>
                  <div className="ip-cp-photo__actions">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept={imageAcceptAttr()}
                      className="ip-cp-sr"
                      onChange={onPhotoFile}
                      disabled={photoBusy}
                    />
                    <button
                      type="button"
                      className="ip-cp-btn ip-cp-btn--outline"
                      disabled={photoBusy}
                      title="Upload new logo."
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {photoBusy ? 'Uploading…' : 'Choose File'}
                    </button>
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
                <span className="ip-cp-pill is-muted">Work In Progress</span>
              </div>
              <p className="ip-cp-hint">
                This feature is work in progress. You can save WhatsApp / Telegram preferences now; delivery is not live until a carrier is connected.
              </p>
              <div className="ip-cp-grid">
                <Field label="WhatsApp number" optional>
                  <input className="ip-cp-input" type="tel" value={form.whatsapp_number || ''} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="+91 98765 43210" />
                </Field>
                <Field label="Telegram handle" optional>
                  <input className="ip-cp-input" value={form.telegram_handle || ''} onChange={(e) => set('telegram_handle', e.target.value)} placeholder="@handle" />
                </Field>
                <label className={`ip-cp-toggle-card is-wa${!waReady ? ' is-disabled' : ''}`}>
                  <span className="ip-cp-im">
                    <span className="ip-cp-im__badge is-wa" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/whatsapp.svg" alt="" width={18} height={18} />
                    </span>
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
                    <span className="ip-cp-im__badge is-tg" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/telegram.svg" alt="" width={18} height={18} />
                    </span>
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
              <button
                type="button"
                className="ip-cp-btn ip-cp-btn--outline"
                onClick={() => {
                  writeProfileDraft(form?.user_id, {
                    form,
                    academics,
                    experiences,
                    exitDraft: true,
                  });
                  setDraftNotOnAccount(true);
                  router.push('/candidate?draft=1');
                }}
              >
                Save draft &amp; exit
              </button>
              {hasNextStep ? null : (
                <button type="submit" className="ip-cp-btn ip-cp-btn--primary" disabled={saving}>
                  {saving ? 'Saving...' : activeTab?.saveLabel || 'Save profile'}
                </button>
              )}
              {hasNextStep ? (
                <button
                  type="button"
                  className="ip-cp-btn ip-cp-btn--primary"
                  disabled={saving}
                  onClick={async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const fromIdx = WIZARD_ORDER.indexOf(profileTab);
                    // Advance even if the save failed — the red error stays visible, but a
                    // rejected field on one step must never trap the user on that step.
                    await save();
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
                  {saving ? 'Saving...' : 'Save & Next'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      {profileTab === 'basics' ? (
        <div className="ip-cp-export">
          <div>
            <div className="ip-cp-export__title">
              <Download />
              <h3>Export Candidate Profile Data (.xlsx)</h3>
            </div>
            <p>Download a multi-sheet Excel workbook with your full profile, academics, skills, applications, offers, and endorsements.</p>
          </div>
          <a className="ip-cp-btn ip-cp-btn--outline" href="/api/ip/candidate/export">
            <Download />
            Download Excel (.xlsx)
          </a>
        </div>
      ) : null}
    </div>
  );
}
