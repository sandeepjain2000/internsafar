'use client';

import { useEffect, useRef, useState } from 'react';
import IpUploadButton from '@/components/ip/IpUploadButton';
import { documentAcceptAttr, imageAcceptAttr } from '@/lib/ipFileUpload';
import '@/components/ip/ip-employer-profile-gemini.css';

const DOC_TYPES = ['Shop Act', 'LLP registration', 'Business PAN', 'Other'];

const INDUSTRY_OPTIONS = [
  'Technology / Software',
  'Education',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail / E-commerce',
  'Consulting',
  'Media / Marketing',
  'Government / Public sector',
  'Nonprofit',
  'Other',
];

const SIZE_OPTIONS = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

function Field({ label, children, span2, hint }) {
  return (
    <div className={`ip-ep-field${span2 ? ' ip-ep-span-2' : ''}`}>
      {label ? <label className="ip-ep-label">{label}</label> : null}
      {children}
      {hint ? <p className="ip-ep-hint">{hint}</p> : null}
    </div>
  );
}

function SelectInput({ children, ...props }) {
  return (
    <div className="ip-ep-select-wrap">
      <select className="ip-ep-select" {...props}>
        {children}
      </select>
      <span className="ip-ep-select-wrap__chevron" aria-hidden>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>
  );
}

function sizeSelectValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const hit = SIZE_OPTIONS.find(
    (o) => o.value === s || o.label === s || s.startsWith(o.value) || s.includes(o.value)
  );
  return hit ? hit.value : s;
}

function FileTextIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );
}

export default function EmployerProfilePage() {
  const [form, setForm] = useState(null);
  const [docs, setDocs] = useState([]);
  const [ethicsItems, setEthicsItems] = useState([]);
  const [ethicsVersion, setEthicsVersion] = useState('');
  const [message, setMessage] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingEthics, setSavingEthics] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docUrl, setDocUrl] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);

  async function load() {
    const res = await fetch('/api/ip/employer/profile');
    const data = await res.json();
    setForm({
      ...data.profile,
      ethics_acks: data.profile?.ethics_acks || {},
    });
    setDocs(data.documents || []);
    setEthicsItems(data.ethicsItems || []);
    setEthicsVersion(data.ethicsVersion || '');
  }

  useEffect(() => {
    load();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setEthics(id, checked) {
    setForm((f) => ({
      ...f,
      ethics_acks: { ...(f.ethics_acks || {}), [id]: Boolean(checked) },
    }));
  }

  async function saveProfile({ ethicsOnly = false } = {}) {
    if (ethicsOnly) setSavingEthics(true);
    else setSavingCompany(true);
    setMessage('');
    try {
      const res = await fetch('/api/ip/employer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profileComplete) {
        setMessage('Profile saved — complete! (Company fields + all Guidelines & Ethics checkboxes.)');
      } else if (!data.ethicsComplete) {
        setMessage(
          'Profile saved, but Guidelines & Ethics is incomplete — check all boxes to finish profile completion.'
        );
      } else {
        setMessage('Profile saved. A few required company fields are still missing.');
      }
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSavingCompany(false);
      setSavingEthics(false);
    }
  }

  async function onLogoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/api/ip/employer/profile/logo/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.hint || 'Upload failed');
      if (data.logo_url || data.fileUrl) {
        set('logo_url', data.logo_url || data.fileUrl);
        setMessage('Logo uploaded to cloud storage.');
      }
    } catch (err) {
      setMessage(err.message || 'Logo upload failed');
    } finally {
      setLogoBusy(false);
    }
  }

  async function addDoc(e) {
    e.preventDefault();
    if (!docFileName && !docUrl) return;
    await fetch('/api/ip/employer/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docType, fileName: docFileName, url: docUrl }),
    });
    setDocFileName('');
    setDocUrl('');
    await load();
  }

  if (!form) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const industryValue = form.industry || '';
  const industryKnown = INDUSTRY_OPTIONS.includes(industryValue);
  const sizeValue = sizeSelectValue(form.company_size);
  const sizeKnown = SIZE_OPTIONS.some((o) => o.value === sizeValue);
  const approved = form.approval_status === 'approved';
  const ethicsAllOn = ethicsItems.length > 0 && ethicsItems.every((item) => !!form.ethics_acks?.[item.id]);

  return (
    <div className="ip-emp-profile">
      <div className="ip-ep-header">
        <div>
          <h1>Employer profile</h1>
          <p>Complete your organization&apos;s details to unlock posting internships.</p>
        </div>
        <span className={`ip-ep-badge${approved ? ' ip-ep-badge--ok' : ''}`}>
          {form.approval_status || 'Pending'}
        </span>
      </div>

      {message ? <div className="ip-ep-alert">{message}</div> : null}

      {/* Company Details */}
      <section className="ip-ep-card">
        <div className="ip-ep-card__head">
          <h2 className="ip-ep-card__title">Company Details</h2>
        </div>
        <div className="ip-ep-stack">
          <div className="ip-ep-logo-row">
            <input
              ref={logoInputRef}
              type="file"
              accept={imageAcceptAttr()}
              className="hidden"
              onChange={onLogoPick}
              disabled={logoBusy}
            />
            <button
              type="button"
              className="ip-ep-logo-box"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoBusy}
              aria-label="Upload company logo"
            >
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url} alt="" />
              ) : (
                <>
                  <CameraIcon />
                  <span>{logoBusy ? '…' : 'Upload'}</span>
                </>
              )}
            </button>
            <div className="ip-ep-logo-fields">
              <label className="ip-ep-label">Or paste logo URL</label>
              <input
                className="ip-ep-input"
                value={form.logo_url || ''}
                onChange={(e) => set('logo_url', e.target.value)}
                placeholder="https://…"
              />
              <p className="ip-ep-hint">Recommended: Square PNG or JPG, at least 200×200px.</p>
            </div>
          </div>

          <div className="ip-ep-grid">
            <Field label="Company / legal name">
              <input
                className="ip-ep-input"
                value={form.company_name || ''}
                onChange={(e) => set('company_name', e.target.value)}
                required
              />
            </Field>
            <Field label="Brand / trading name">
              <input
                className="ip-ep-input"
                value={form.brand_name || ''}
                onChange={(e) => set('brand_name', e.target.value)}
              />
            </Field>
            <Field label="Website">
              <input
                className="ip-ep-input"
                value={form.website || ''}
                onChange={(e) => set('website', e.target.value)}
                required
              />
            </Field>
            <Field label="Industry">
              <SelectInput
                value={industryKnown ? industryValue : industryValue || ''}
                onChange={(e) => set('industry', e.target.value)}
                required
              >
                <option value="">Select industry</option>
                {!industryKnown && industryValue ? (
                  <option value={industryValue}>{industryValue}</option>
                ) : null}
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Company size">
              <SelectInput
                value={sizeKnown ? sizeValue : sizeValue || ''}
                onChange={(e) => set('company_size', e.target.value)}
              >
                <option value="">Select size</option>
                {!sizeKnown && sizeValue ? <option value={sizeValue}>{form.company_size}</option> : null}
                {SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </div>
      </section>

      {/* Contact & Location */}
      <section className="ip-ep-card">
        <div className="ip-ep-card__head">
          <h2 className="ip-ep-card__title">Contact &amp; Location</h2>
        </div>
        <div className="ip-ep-grid">
          <Field label="HQ City">
            <input
              className="ip-ep-input"
              value={form.hq_city || ''}
              onChange={(e) => set('hq_city', e.target.value)}
              placeholder="e.g. Pune"
              required
            />
          </Field>
          <Field label="HQ State / Province">
            <input
              className="ip-ep-input"
              value={form.hq_state || ''}
              onChange={(e) => set('hq_state', e.target.value)}
              placeholder="e.g. Maharashtra"
            />
          </Field>
          <Field label="Primary Contact Person">
            <input
              className="ip-ep-input"
              value={form.contact_name || ''}
              onChange={(e) => set('contact_name', e.target.value)}
              required
            />
          </Field>
          <Field label="Designation / Role">
            <input
              className="ip-ep-input"
              value={form.contact_designation || ''}
              onChange={(e) => set('contact_designation', e.target.value)}
              placeholder="e.g. Placement Officer"
            />
          </Field>
          <Field label="Contact Phone">
            <input
              className="ip-ep-input"
              type="tel"
              value={form.contact_phone || ''}
              onChange={(e) => set('contact_phone', e.target.value)}
              placeholder="+91 98765 43210"
              required
            />
          </Field>
          <Field label="Work Email">
            <input
              className="ip-ep-input"
              type="email"
              value={form.work_email || ''}
              onChange={(e) => set('work_email', e.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      {/* About & Visibility */}
      <section className="ip-ep-card">
        <div className="ip-ep-card__head">
          <h2 className="ip-ep-card__title">About &amp; Visibility</h2>
        </div>
        <div className="ip-ep-stack">
          <Field label="About the company">
            <textarea
              className="ip-ep-textarea"
              rows={4}
              value={form.about || ''}
              onChange={(e) => set('about', e.target.value)}
              placeholder="Describe your organization, mission, and culture…"
            />
          </Field>
          <Field label="LinkedIn / Company page">
            <input
              className="ip-ep-input"
              value={form.linkedin_url || ''}
              onChange={(e) => set('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/company/…"
            />
          </Field>
          <div className="ip-ep-prefs">
            <label className="ip-ep-label">Platform Preferences</label>
            <label className="ip-ep-check">
              <input
                type="checkbox"
                checked={!!form.show_identity_on_posting}
                onChange={(e) => set('show_identity_on_posting', e.target.checked)}
              />
              Show company identity on internship postings
            </label>
            <label className="ip-ep-check">
              <input
                type="checkbox"
                checked={!!form.show_hiring_numbers}
                onChange={(e) => set('show_hiring_numbers', e.target.checked)}
              />
              Show hiring numbers (active applications) to candidates
            </label>
            <label className="ip-ep-check">
              <input
                type="checkbox"
                checked={!!form.whatsapp_opt_in}
                onChange={(e) => set('whatsapp_opt_in', e.target.checked)}
              />
              Opt in to WhatsApp communications from candidates
            </label>
            <label className="ip-ep-check">
              <input
                type="checkbox"
                checked={!!form.telegram_opt_in}
                onChange={(e) => set('telegram_opt_in', e.target.checked)}
              />
              Opt in to Telegram communications from candidates
            </label>
          </div>
          <div className="ip-ep-actions">
            <button
              type="button"
              className="ip-ep-btn ip-ep-btn--primary"
              disabled={savingCompany}
              onClick={() => saveProfile({ ethicsOnly: false })}
            >
              {savingCompany ? 'Saving Details…' : 'Save Company Details'}
            </button>
          </div>
        </div>
      </section>

      {/* Guidelines & Ethics */}
      <section className="ip-ep-card">
        <div className="ip-ep-card__head ip-ep-card__head--plain">
          <h2 className="ip-ep-card__title">Guidelines &amp; Ethics</h2>
          <p className="ip-ep-card__desc">
            Required for profile completion. Confirm each item.
            {ethicsVersion ? ` (Version: ${ethicsVersion}` : ' (Version: —'}
            {form.ethics_accepted_at
              ? ` · Accepted ${new Date(form.ethics_accepted_at).toLocaleString()})`
              : ')'}
          </p>
        </div>
        <div className="ip-ep-ethics">
          {(ethicsItems.length ? ethicsItems : []).map((item) => {
            const on = !!form.ethics_acks?.[item.id];
            return (
              <label key={item.id} className={`ip-ep-ethic${on ? ' ip-ep-ethic--on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setEthics(item.id, e.target.checked)}
                />
                <span>{item.label}</span>
              </label>
            );
          })}
          {!ethicsItems.length ? (
            <p className="ip-ep-hint">Ethics checklist failed to load. Refresh the page.</p>
          ) : null}
        </div>
        <div className="ip-ep-actions">
          <button
            type="button"
            className={`ip-ep-btn ${ethicsAllOn ? 'ip-ep-btn--primary' : 'ip-ep-btn--secondary'}`}
            disabled={savingEthics}
            onClick={() => saveProfile({ ethicsOnly: true })}
          >
            {savingEthics ? 'Saving…' : 'Save Acknowledgements'}
          </button>
        </div>
      </section>

      {/* Verification documents */}
      <section className="ip-ep-card">
        <div className="ip-ep-card__head ip-ep-card__head--plain">
          <h2 className="ip-ep-card__title">
            Verification Documents <span className="ip-ep-pill">Optional</span>
          </h2>
          <p className="ip-ep-card__desc">
            Shop Act, LLP registration, Business PAN, or other company-registration evidence.
          </p>
        </div>

        {docs.length ? (
          <div className="ip-ep-doc-list">
            {docs.map((d) => (
              <div key={d.id} className="ip-ep-doc">
                <div className="ip-ep-doc__main">
                  <div className="ip-ep-doc__icon">
                    <FileTextIcon />
                  </div>
                  <div className="min-w-0">
                    <p className="ip-ep-doc__title">{d.doc_type || 'Document'}</p>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ip-ep-doc__link"
                      >
                        {d.file_name || 'Open file'}
                      </a>
                    ) : (
                      <span className="ip-ep-doc__meta">{d.file_name || '—'}</span>
                    )}
                  </div>
                </div>
                <span className={`ip-ep-badge${d.review_status === 'approved' ? ' ip-ep-badge--ok' : ''}`}>
                  {d.review_status || 'pending'}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="ip-ep-upload-panel">
          <h3>Upload new document</h3>
          <div className="ip-ep-upload-row">
            <SelectInput value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectInput>
            <div className="ip-ep-upload-wrap">
              <IpUploadButton
                endpoint="/api/ip/employer/documents/upload"
                accept={documentAcceptAttr()}
                label="Upload File (PDF/Image)"
                extraFormData={{ docType }}
                onUploaded={async () => {
                  setMessage('Document uploaded.');
                  await load();
                }}
              />
            </div>
          </div>

          <div className="ip-ep-or">
            <span>OR</span>
          </div>

          <form className="ip-ep-upload-row" onSubmit={addDoc}>
            <input
              className="ip-ep-input"
              style={{ maxWidth: '12.5rem' }}
              placeholder="File name"
              value={docFileName}
              onChange={(e) => setDocFileName(e.target.value)}
            />
            <input
              className="ip-ep-input"
              style={{ flex: 1 }}
              placeholder="URL (optional)"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
            />
            <button type="submit" className="ip-ep-btn ip-ep-btn--secondary">
              <PlusIcon /> Add Link
            </button>
          </form>
          <p className="ip-ep-hint">
            Prefer the upload button — it stores the file directly. The link form is for referencing a
            document already hosted elsewhere.
          </p>
        </div>
      </section>
    </div>
  );
}
