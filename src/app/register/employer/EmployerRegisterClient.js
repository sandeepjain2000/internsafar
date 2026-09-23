'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import { readCaptchaField } from '@/lib/captchaClient';
import '@/components/ip/ip-register-gemini.css';
import '@/components/ip/ip-login-gemini.css';

/**
 * Employer registration — Domain-based vs Free-email-based (equal choose UI).
 * Both paths: form + captcha + email verify + SuperAdmin approval. No Google.
 */
export default function EmployerRegisterPage() {
  const sp = useSearchParams();
  const referralCode = sp.get('ref') || '';
  const [path, setPath] = useState('choose'); // choose | domain | free_email | done
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaFieldRef = useRef(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendHint, setResendHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  function goBack() {
    if (path === 'choose') return;
    setPath('choose');
    setError('');
  }

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function resendVerify() {
    const target = String(done?.email || email || '').trim();
    if (!target || resendBusy || resendCooldown > 0) return;
    setResendBusy(true);
    setResendHint('');
    setError('');
    try {
      const res = await fetch('/api/ip/auth/employer-email-verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setResendCooldown(Number(data.retryAfterSec) || 45);
        setError(data.error || 'Please wait before requesting another email.');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Could not resend verification email');
        return;
      }
      setResendCooldown(Number(data.cooldownSec) || 45);
      setResendHint(data.message || 'If that email needs verification, a new link has been sent.');
    } catch (err) {
      setError(err.message || 'Could not resend verification email');
    } finally {
      setResendBusy(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const challenge = readCaptchaField(captchaFieldRef, captchaToken, captchaAnswer);
    try {
      const res = await fetch('/api/ip/auth/register-employer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          email,
          website: path === 'domain' ? website : undefined,
          companyName,
          contactName,
          designation,
          password,
          captchaToken: challenge.token,
          captchaAnswer: challenge.answer,
          referralCode: referralCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setDone({ ...data, email });
      setPath('done');
      setResendCooldown(45);
      setResendHint('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const formPath = path === 'domain' || path === 'free_email';

  return (
    <div className="ip-gemini-register">
      <div className="ip-reg-page">
        <div className="mb-6">
          <IpGeminiBrand />
        </div>

        <div className="ip-reg-shell">
          <div className="ip-reg-shell__head ip-reg-shell__head--employer">
            <div>
              {path === 'choose' ? (
                <Link href="/register" className="ip-reg-back">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Change account type
                </Link>
              ) : path === 'done' ? (
                <Link href="/register/employer" className="ip-reg-back">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Back
                </Link>
              ) : (
                <button type="button" className="ip-reg-back" onClick={goBack}>
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Back
                </button>
              )}
              <h2>Employer Registration</h2>
              <p>Post internships and hire top verified students</p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/20 text-purple-300">
              <Building2 className="size-5" aria-hidden />
            </span>
          </div>

          <div className="ip-reg-shell__body">
            {referralCode ? (
              <Alert>
                <AlertTitle>Referral</AlertTitle>
                <AlertDescription>
                  Registering with code <code>{referralCode}</code>
                </AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {path === 'choose' ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="ip-reg-submit"
                  onClick={() => {
                    setPath('domain');
                    setError('');
                  }}
                >
                  Domain-based
                </button>
                <button
                  type="button"
                  className="ip-reg-submit"
                  onClick={() => {
                    setPath('free_email');
                    setError('');
                  }}
                >
                  Free-email-based
                </button>
                <p className="m-0 text-xs text-slate-500">
                  Both options create a pending employer account. Verify your email, then sign in to upload documents.
                  Postings unlock after SuperAdmin approval.
                </p>
              </div>
            ) : null}

            {formPath ? (
              <form className="flex flex-col gap-4" onSubmit={submitForm}>
                <p className="m-0 text-xs text-slate-500">
                  {path === 'domain'
                    ? 'Use your company domain email. Captcha, email verification, and SuperAdmin approval are required. Free / consumer mailboxes are accepted but flagged for SuperAdmin review.'
                    : 'Register with any email and password. Captcha, email verification, and SuperAdmin approval are required.'}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="ip-reg-field">
                    <label htmlFor="m-contact">Your Full Name</label>
                    <input
                      id="m-contact"
                      className="ip-reg-input"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      required
                    />
                  </div>
                  <div className="ip-reg-field">
                    <label htmlFor="m-designation">Designation / Role</label>
                    <input
                      id="m-designation"
                      className="ip-reg-input"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. University Recruiter"
                      required
                    />
                  </div>
                </div>

                <div className="ip-reg-field">
                  <label htmlFor="m-company">Company / Organization Name</label>
                  <input
                    id="m-company"
                    className="ip-reg-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    required
                  />
                </div>

                {path === 'domain' ? (
                  <div className="ip-reg-field">
                    <label htmlFor="m-website">Company Domain / Website</label>
                    <input
                      id="m-website"
                      className="ip-reg-input"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="e.g. https://acme.com"
                      required
                    />
                  </div>
                ) : null}

                <div className="ip-reg-field">
                  <label htmlFor="m-email">
                    {path === 'domain' ? 'Company Domain Email' : 'Email'}
                  </label>
                  <input
                    id="m-email"
                    className="ip-reg-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={path === 'domain' ? 'sarah@company.com' : 'you@email.com'}
                    required
                  />
                  <p className="hint">
                    {path === 'domain'
                      ? 'Please use your company domain email only — do not use free email services.'
                      : 'We will send a verification link to this address.'}
                  </p>
                </div>

                <div className="ip-reg-field">
                  <label htmlFor="m-password">Password</label>
                  <input
                    id="m-password"
                    className="ip-reg-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                  />
                </div>

                <LoginCaptchaField
                  ref={captchaFieldRef}
                  variant="securityCard"
                  token={captchaToken}
                  answer={captchaAnswer}
                  onTokenChange={setCaptchaToken}
                  onAnswerChange={setCaptchaAnswer}
                  disabled={loading}
                />

                <button type="submit" className="ip-reg-submit ip-reg-submit--accent" disabled={loading}>
                  {loading ? 'Submitting…' : 'Register as Employer'}
                </button>
              </form>
            ) : null}

            {path === 'done' && done ? (
              <div className="flex flex-col gap-4">
                <Alert>
                  <AlertTitle>Check your email</AlertTitle>
                  <AlertDescription>
                    {done.message ||
                      'Account created. Verify your email from the link we sent, then sign in to upload documents. Postings unlock after SuperAdmin approval.'}
                    {done.softFail
                      ? ' Your email was flagged for SuperAdmin review (for example free-provider or inconclusive mail check).'
                      : ''}
                    {done.warning ? ` ${done.warning}` : ''}
                    {resendHint ? ` ${resendHint}` : ''}
                  </AlertDescription>
                </Alert>
                <button
                  type="button"
                  className="ip-reg-submit"
                  disabled={resendBusy || resendCooldown > 0}
                  onClick={resendVerify}
                >
                  {resendBusy
                    ? 'Sending…'
                    : resendCooldown > 0
                      ? `Didn't get it? Resend (${resendCooldown}s)`
                      : "Didn't get it? Resend"}
                </button>
                <Link href="/" className="ip-reg-submit ip-reg-submit--accent" style={{ textDecoration: 'none' }}>
                  Back to Sign In
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <footer className="ip-reg-site-footer">InternSafar Internship Portal © 2026. All rights reserved.</footer>
    </div>
  );
}
