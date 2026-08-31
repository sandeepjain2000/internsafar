'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import { domainsMatch } from '@/lib/authRegisterRules';
import { emailDomain } from '@/lib/emailDomains';
import { readCaptchaField } from '@/lib/captchaClient';
import '@/components/ip/ip-register-gemini.css';
import '@/components/ip/ip-login-gemini.css';

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

/**
 * Employer registration — Gemini shell; live Domain vs SuperAdmin form paths unchanged.
 */
export default function EmployerRegisterPage() {
  const sp = useSearchParams();
  const referralCode = sp.get('ref') || '';
  const gv = sp.get('gv') || '';
  const [path, setPath] = useState(gv ? 'domain' : 'choose'); // choose | domain-google | domain | form | done
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
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
  const [hint, setHint] = useState('');
  // The Google Workspace account Google confirmed. The work email is derived from it, so a
  // recruiter cannot claim a company domain they have no account on.
  const [verified, setVerified] = useState(null);
  const [checkingGv, setCheckingGv] = useState(Boolean(gv));
  const [startingGoogle, setStartingGoogle] = useState(false);

  useEffect(() => {
    if (!gv) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/ip/auth/google-verification?token=${encodeURIComponent(gv)}&purpose=employer-register`,
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || 'Verification could not be read');
        setVerified({ email: data.email, name: data.name || '' });
        // The work email IS the verified account — it is no longer a field, so a recruiter
        // cannot claim a mailbox they have not signed in to. Website is prefilled from the
        // same domain, which is what the API checks it against.
        setEmail(data.email);
        setContactName((v) => v || data.name || '');
        setWebsite((v) => v || `https://${emailDomain(data.email)}`);
        setHint(
          `Google verified ${data.email}. Confirm your company website and we email a temporary password to that Google inbox.`,
        );
      } catch (err) {
        if (alive) {
          setError(err.message);
          setPath('domain-google');
        }
      } finally {
        if (alive) setCheckingGv(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gv]);

  const continueWithGoogle = useCallback(async () => {
    setError('');
    setStartingGoogle(true);
    try {
      const res = await fetch('/api/ip/auth/google-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'employer-register' }),
      });
      if (!res.ok) throw new Error('Could not start Google verification');
      const back = referralCode
        ? `/register/employer?ref=${encodeURIComponent(referralCode)}`
        : '/register/employer';
      await signIn('google', { callbackUrl: back });
    } catch (err) {
      setError(err.message);
      setStartingGoogle(false);
    }
  }, [referralCode]);

  function goBack() {
    if (path === 'choose') return;
    setPath('choose');
    setError('');
    setHint('');
  }

  async function submitDomain(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!verified) {
      setError('Verify with Google first — the domain path needs your company Google account.');
      setLoading(false);
      return;
    }
    if (!domainsMatch(website, email)) {
      setError('Website domain and work-email domain must match (e.g. company.com and hr@company.com).');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/ip/auth/register-employer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website,
          email,
          companyName,
          contactName,
          googleVerificationToken: gv,
          manualRequest: false,
          referralCode: referralCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDone(data);
      setPath('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    // API still requires `reason`; mock has no reason field — auto-build from designation.
    const mergedReason = designation.trim()
      ? `Designation: ${designation.trim()}`
      : 'Employer registration request via form';
    const challenge = readCaptchaField(captchaFieldRef, captchaToken, captchaAnswer);
    try {
      const res = await fetch('/api/ip/auth/register-employer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          companyName,
          contactName,
          designation,
          password,
          reason: mergedReason,
          manualRequest: true,
          captchaToken: challenge.token,
          captchaAnswer: challenge.answer,
          referralCode: referralCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDone(data);
      setPath('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
              ) : (
                <button type="button" className="ip-reg-back" onClick={goBack}>
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Back
                </button>
              )}
              <h2>Employer & Partner Registration</h2>
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
            {hint ? (
              <Alert>
                <AlertDescription>{hint}</AlertDescription>
              </Alert>
            ) : null}

            {path === 'choose' ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="ip-reg-submit"
                  onClick={() => {
                    setPath('domain-google');
                    setError('');
                  }}
                >
                  Domain register (matching website + work email)
                </button>
                <button
                  type="button"
                  className="ip-reg-submit ip-reg-submit--outline"
                  onClick={() => {
                    setPath('form');
                    setError('');
                  }}
                >
                  Form — request SuperAdmin to create my account
                </button>
                <p className="m-0 text-xs text-slate-500">
                  Domain path requires website hostname and email domain to be the same. Form is for cases without a
                  matching company domain/email — SuperAdmin will create the account after review.
                </p>
              </div>
            ) : null}

            {path === 'domain-google' ? (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-center text-sm text-slate-500">
                  Verify with Google, then enter your website and matching work email.
                </p>
                <div className="ip-reg-social">
                  <button type="button" onClick={continueWithGoogle} disabled={startingGoogle || checkingGv}>
                    <GoogleMark />
                    {startingGoogle ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                </div>
              </div>
            ) : null}

            {path === 'domain' ? (
              <form className="flex flex-col gap-4" onSubmit={submitDomain}>
                <div className="ip-reg-panel">
                  <h3>Automated domain verification</h3>
                  {verified ? (
                    <div className="ip-reg-verified">
                      <GoogleMark />
                      <div>
                        <strong>{verified.email}</strong>
                        <span>Verified with Google</span>
                      </div>
                      <button type="button" onClick={continueWithGoogle}>
                        Change account
                      </button>
                    </div>
                  ) : (
                    <p className="ip-reg-hint">
                      {checkingGv
                        ? 'Reading your Google verification…'
                        : 'Google verification is required for this path.'}
                    </p>
                  )}
                  {/* Website is prefilled from the verified Google domain and the work email is
                      fixed to the verified account, so the usual "domains must match" rule is
                      satisfied without retyping either. Website stays editable because a company
                      may serve its site on a different host than its mail domain. Company and
                      contact name are no longer asked: Google supplies the name, and SuperAdmin
                      can correct the company on approval. */}
                  <div className="ip-reg-field">
                    <label htmlFor="website">Company website</label>
                    <input
                      id="website"
                      className="ip-reg-input"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourcompany.com"
                      required
                    />
                    <p className="ip-reg-hint">
                      Must be on the same domain as your Google account
                      {verified ? ` (${emailDomain(verified.email)})` : ''}.
                    </p>
                  </div>
                </div>
                <button type="submit" className="ip-reg-submit ip-reg-submit--accent" disabled={loading}>
                  {loading ? 'Registering…' : 'Register & email password'}
                </button>
              </form>
            ) : null}

            {path === 'form' ? (
              <form className="flex flex-col gap-4" onSubmit={submitForm}>
                <p className="m-0 text-xs text-slate-500">
                  SuperAdmin must approve this registration before you can sign in. Use the password you set after
                  approval.
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

                <div className="ip-reg-field">
                  <label htmlFor="m-email">Official Work Email</label>
                  <input
                    id="m-email"
                    className="ip-reg-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@company.com"
                    required
                  />
                  <p className="hint">Please use your company domain email when possible.</p>
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
                  <AlertTitle>{done.mode === 'manual_request' ? 'Request submitted' : 'Account created'}</AlertTitle>
                  <AlertDescription>
                    {done.message}
                    {done.warning ? ` ${done.warning}` : ''}
                    {done.mode === 'manual_request'
                      ? ' SuperAdmin will create your account if approved — watch for follow-up.'
                      : ' Use the emailed password on the login page to enter the employer portal.'}
                  </AlertDescription>
                </Alert>
                <Link href="/" className="ip-reg-submit ip-reg-submit--accent" style={{ textDecoration: 'none' }}>
                  Go to login
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
