'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import { domainFromEmail, domainsMatch, isConsumerEmailDomain } from '@/lib/authRegisterRules';
import { readCaptchaField } from '@/lib/captchaClient';
import { BUSINESS_ENTITY_TYPES } from '@/lib/employerBusinessEntity';
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
 * Google verification survives the URL cleanup remount via sessionStorage. The token is
 * still validated and spent server-side, so this cache grants nothing on its own.
 */
const GOOGLE_VERIFICATION_KEY = 'ip-employer-google-verification';
const GOOGLE_VERIFICATION_TTL_MS = 10 * 60 * 1000;

function readStoredVerification() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_VERIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.email) return null;
    parsed.name = parsed.name || '';
    parsed.pictureUrl = parsed.pictureUrl || '';
    if (Date.now() - Number(parsed.at || 0) > GOOGLE_VERIFICATION_TTL_MS) {
      window.sessionStorage.removeItem(GOOGLE_VERIFICATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeVerification({ token, email, name, pictureUrl }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      GOOGLE_VERIFICATION_KEY,
      JSON.stringify({ token, email, name: name || '', pictureUrl: pictureUrl || '', at: Date.now() }),
    );
  } catch {
    /* private mode / storage disabled — flow still works within one mount */
  }
}

function clearStoredVerification() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(GOOGLE_VERIFICATION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Employer registration — Gemini shell; live Domain vs SuperAdmin form paths unchanged.
 */
export default function EmployerRegisterPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const referralCode = sp.get('ref') || '';
  const googleToken = sp.get('gv') || '';
  const [path, setPath] = useState('choose'); // choose | domain-google | domain | form | done
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [designation, setDesignation] = useState('');
  const [businessEntityType, setBusinessEntityType] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaFieldRef = useRef(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState('');
  const [googleVerification, setGoogleVerification] = useState(null); // { token, email }
  const [googleBusy, setGoogleBusy] = useState(false);

  // Returning from a real Google consent flow: /register/employer?gv=<single-use token>.
  // The token is only issued after Google confirmed the account, and the API re-checks
  // it server-side, so this cannot be faked by jumping straight to the domain step.
  //
  // Stripping ?gv= from the URL remounts this component, so the confirmed verification
  // is mirrored in sessionStorage and restored on mount — otherwise the user is thrown
  // back to the first step immediately after a successful Google sign-in.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!googleToken) {
        const stored = readStoredVerification();
        if (stored && !cancelled) {
          // One-shot: the cache exists only to survive the remount caused by stripping
          // ?gv= from the URL. Spending it here means coming back to this page later
          // starts a fresh Google verification instead of trusting a stale one.
          clearStoredVerification();
          setGoogleVerification(stored);
          setEmail((current) => current || stored.email);
          if (stored.name) setContactName((current) => current || stored.name);
          setPath('domain');
        }
        return;
      }

      const cleanUrl = referralCode
        ? `/register/employer?ref=${encodeURIComponent(referralCode)}`
        : '/register/employer';
      try {
        const res = await fetch(
          `/api/ip/auth/google-verification?token=${encodeURIComponent(googleToken)}`,
        );
        const data = await res.json();
        const ok = res.ok && Boolean(data.email);
        // Persist before the cancelled check: in StrictMode the first effect pass is
        // torn down mid-flight, and the surviving mount reads this back after the URL
        // loses ?gv=. Skipping it here left the page stuck on the Google step.
        const verified = {
          token: googleToken,
          email: data.email,
          name: data.name || '',
          pictureUrl: data.pictureUrl || '',
        };
        if (ok) storeVerification(verified);
        else clearStoredVerification();
        if (cancelled) return;
        if (!ok) {
          setError(
            'Google verification could not be confirmed (the link may have expired). Please verify with Google again.',
          );
          setPath('domain-google');
          return;
        }
        setGoogleVerification(verified);
        setEmail((current) => current || data.email);
        if (verified.name) setContactName((current) => current || verified.name);
        setPath('domain');
      } catch {
        if (!cancelled) {
          clearStoredVerification();
          setError('Could not confirm Google verification. Please try again.');
          setPath('domain-google');
        }
      } finally {
        // Keep the one-time token out of the address bar / history. Only the live pass
        // rewrites the URL — a cancelled pass would strip ?gv= from under the pass that
        // is still fetching.
        if (!cancelled) router.replace(cleanUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleToken, referralCode, router]);

  const startGoogleVerification = useCallback(async () => {
    setError('');
    setHint('');
    setGoogleBusy(true);
    // Tells the NextAuth signIn callback this is registration verification, not a login.
    document.cookie = 'ip_google_intent=employer-register; path=/; max-age=600; samesite=lax';
    try {
      await signIn('google', { callbackUrl: '/register/employer' });
    } catch {
      setGoogleBusy(false);
      setError('Could not start Google verification. Please try again.');
    }
  }, []);

  const restartGoogleVerification = useCallback(() => {
    clearStoredVerification();
    setGoogleVerification(null);
    setEmail('');
    setError('');
    setHint('');
    setPath('domain-google');
  }, []);

  function goBack() {
    if (path === 'choose') return;
    setPath('choose');
    setError('');
    setHint('');
    setGoogleVerification(null);
    clearStoredVerification();
  }

  async function submitDomain(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!googleVerification?.token) {
      setError('Verify with Google before registering.');
      setPath('domain-google');
      setLoading(false);
      return;
    }
    if (!domainsMatch(website, email)) {
      setError('Website domain and work-email domain must match (e.g. company.com and hr@company.com).');
      setLoading(false);
      return;
    }
    const workDomain = domainFromEmail(email);
    if (isConsumerEmailDomain(workDomain)) {
      setError(
        `${workDomain} is a personal mailbox provider, not a company domain. Use the Form path if you do not have a company domain.`,
      );
      setLoading(false);
      return;
    }
    if (domainFromEmail(googleVerification.email) !== workDomain) {
      setError(
        `Your Google account (${googleVerification.email}) is not on the ${workDomain} domain. Verify with a company Google account, or use the Form path.`,
      );
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
          businessEntityType,
          manualRequest: false,
          googleVerificationToken: googleVerification.token,
          referralCode: referralCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          // Token spent or expired — force a fresh, real Google verification.
          clearStoredVerification();
          setGoogleVerification(null);
          setPath('domain-google');
          setHint('');
        }
        throw new Error(data.error || 'Failed');
      }
      // Token is single-use and now spent server-side.
      clearStoredVerification();
      setGoogleVerification(null);
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
          businessEntityType,
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
                  Verify with your <strong>company</strong> Google account, then enter your website and matching
                  work email.
                </p>
                <div className="ip-reg-social">
                  <button type="button" onClick={startGoogleVerification} disabled={googleBusy}>
                    <GoogleMark />
                    {googleBusy ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                </div>
                <p className="m-0 text-center text-xs text-slate-500">
                  Google only confirms the account is yours — it does not sign you into the portal. After
                  verifying you will finish registration and receive a temporary password by email.
                </p>
              </div>
            ) : null}

            {path === 'domain' ? (
              <form className="flex flex-col gap-4" onSubmit={submitDomain}>
                {googleVerification?.email ? (
                  <div className="ip-reg-google-verified">
                    {googleVerification.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={googleVerification.pictureUrl}
                        alt=""
                        width={40}
                        height={40}
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <div>
                      <strong>Google account verified</strong>
                      <p>
                        {googleVerification.name ? `${googleVerification.name} — ` : ''}
                        {googleVerification.email}. Your website and work email must both be on the{' '}
                        <strong>{domainFromEmail(googleVerification.email)}</strong> domain.
                      </p>
                      <button type="button" className="ip-reg-relink" onClick={restartGoogleVerification}>
                        Use a different Google account
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="ip-reg-panel">
                  <h3>Automated domain verification</h3>
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
                  </div>
                  <div className="ip-reg-field">
                    <label htmlFor="work-email">Work email (same domain as website)</label>
                    <input
                      id="work-email"
                      className="ip-reg-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hr@yourcompany.com"
                      required
                    />
                    <p className="hint">
                      The temporary password is sent here. It may differ from your Google address, as long as
                      the domain is the same.
                    </p>
                  </div>
                  <div className="ip-reg-field">
                    <label htmlFor="company">Company name (optional)</label>
                    <input
                      id="company"
                      className="ip-reg-input"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="ip-reg-field">
                    <label htmlFor="contact">Contact name (optional)</label>
                    <input
                      id="contact"
                      className="ip-reg-input"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div className="ip-reg-field">
                    <label htmlFor="entity-type">Business entity type</label>
                    <select
                      id="entity-type"
                      className="ip-reg-input"
                      value={businessEntityType}
                      onChange={(e) => setBusinessEntityType(e.target.value)}
                      required
                    >
                      <option value="">Select entity type</option>
                      {BUSINESS_ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
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
                  <label htmlFor="m-entity-type">Business entity type</label>
                  <select
                    id="m-entity-type"
                    className="ip-reg-input"
                    value={businessEntityType}
                    onChange={(e) => setBusinessEntityType(e.target.value)}
                    required
                  >
                    <option value="">Select entity type</option>
                    {BUSINESS_ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
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
