'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Mail,
  Sparkles,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import { isGmailAddress, normalizeEmail } from '@/lib/authRegisterRules';
import '@/components/ip/ip-login-gemini.css';
import '@/components/ip/ip-candidate-register-gemini.css';

function GoogleMark() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
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

function emailDomain(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  return at > 0 ? e.slice(at + 1) : '';
}

export default function CandidateRegisterPage() {
  const sp = useSearchParams();
  const urlRef = sp.get('ref') || '';
  // Google hands the verification token back on the return URL as ?gv=…
  const gv = sp.get('gv') || '';
  // No field for this on the page: a code only arrives via a referral link (?ref=…),
  // which is preserved across the Google round trip on the return URL.
  const [referralCode] = useState(urlRef);
  const [step, setStep] = useState('form');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  // The Google-verified account. Until this is set there is nothing to register:
  // the address must come from Google, never from a field the visitor can type.
  const [verified, setVerified] = useState(null);
  const [checkingGv, setCheckingGv] = useState(Boolean(gv));
  const [startingGoogle, setStartingGoogle] = useState(false);

  useEffect(() => {
    fetch('/api/ip/bootstrap', { method: 'POST' }).catch(() => {});
  }, []);

  /**
   * Create the account straight from the Google verification. There is no form to submit:
   * Google supplies the address and the profile name, and the referral code (if any) was
   * captured before the redirect and carried back on the return URL. Runs once per token.
   */
  const createdRef = useRef('');
  const createAccount = useCallback(
    async (account) => {
      if (!account || createdRef.current === gv) return;
      createdRef.current = gv;
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/ip/auth/register-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'google',
            name: account.name || account.email.split('@')[0],
            email: account.email,
            googleVerificationToken: gv,
            referralCode: referralCode.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        setDone({
          name: account.name || '',
          email: normalizeEmail(account.email),
          startingPoints: Number(data.startingPoints || 50),
          referralApplied: Boolean(data.referralApplied),
          message: data.message || 'Account created. Temporary password emailed to your Gmail.',
          warning: data.warning || '',
        });
        setStep('done');
      } catch (err) {
        // The token is single-use, so a failure here cannot be retried by resubmitting —
        // the visitor has to run Google again. Say so rather than showing a dead button.
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [gv, referralCode],
  );

  useEffect(() => {
    if (!gv) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/ip/auth/google-verification?token=${encodeURIComponent(gv)}&purpose=candidate-register`,
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || 'Verification could not be read');
        const account = { email: data.email, name: data.name || '', pictureUrl: data.pictureUrl || '' };
        setVerified(account);
        if (!isGmailAddress(account.email)) {
          setError(
            `Google account ${account.email} is not a personal Gmail address. Candidate accounts require @gmail.com or @googlemail.com — choose a different Google account.`,
          );
          return;
        }
        await createAccount(account);
      } catch (err) {
        if (alive) setError(err.message);
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
      // Arm the intent first: signIn refuses Google without it, so the consent screen can
      // never be turned into a login for an existing account.
      const res = await fetch('/api/ip/auth/google-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'candidate-register' }),
      });
      if (!res.ok) throw new Error('Could not start Google verification');
      const back = referralCode.trim()
        ? `/register/candidate?ref=${encodeURIComponent(referralCode.trim())}`
        : '/register/candidate';
      await signIn('google', { callbackUrl: back });
    } catch (err) {
      setError(err.message);
      setStartingGoogle(false);
    }
  }, [referralCode]);

  return (
    <div className="ip-cand-reg">
      <header className="ip-crg-topbar">
        <IpGeminiBrand href="/" subtitle="Candidate Portal" />
        <div className="ip-crg-topbar-signin">
          <span>Already registered?</span>
          <Link href="/" className="ip-crg-signin">
            Sign In
          </Link>
        </div>
      </header>

      <main className="ip-crg-main">
        <div className="ip-crg-card">
          <div className="ip-crg-head">
            <div>
              <Link href="/register" className="ip-crg-back">
                <ArrowLeft className="size-3.5" aria-hidden />
                Change account type
              </Link>
              <h1>Candidate Registration</h1>
              <p>Join InternSafar to start your internship search</p>
            </div>
            <span className="ip-crg-head-ico">
              <GraduationCap aria-hidden />
            </span>
          </div>

          {step === 'form' ? (
            <div className="ip-crg-body">
              <div className="ip-crg-notice">
                <h3>
                  <Sparkles aria-hidden />
                  Candidate accounts are created using Gmail
                </h3>
                <p>Use your personal Gmail or Googlemail address to continue.</p>
                <div className="ip-crg-notice-warn">
                  <AlertCircle aria-hidden />
                  <span>
                    Institutional or university email addresses (e.g., @college.edu, @mit.edu) are not
                    accepted. Only @gmail.com and @googlemail.com addresses are permitted.
                  </span>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Registration failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {!verified ? (
                <div className="ip-crg-google-gate">
                  {checkingGv ? (
                    <p className="ip-crg-hint">Reading your Google verification…</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ip-crg-google-btn"
                        onClick={continueWithGoogle}
                        disabled={startingGoogle}
                      >
                        <GoogleMark />
                        {startingGoogle ? 'Opening Google…' : 'Sign up with Google'}
                      </button>
                      <p className="ip-crg-legal">
                        Google asks which account to use, then brings you straight back — your account
                        is created from that Google address. We never ask you to type your Gmail, so an
                        account can only be created for the Google account you actually sign in to.
                      </p>
                    </>
                  )}
                </div>
              ) : null}

              {verified ? (
                <div className="ip-crg-field">
                  <div className="ip-crg-verified">
                    <Mail aria-hidden />
                    <div>
                      <strong>{verified.email}</strong>
                      <span>{loading ? 'Creating your account…' : 'Verified with Google'}</span>
                    </div>
                    <CheckCircle2 aria-hidden />
                  </div>
                  {/* The non-Gmail rejection is raised as an error by the verification effect
                      before the account is created, so it surfaces in the Alert above. */}
                  {/* The token is single-use, so recovery is a fresh Google run, not a retry. */}
                  <button
                    type="button"
                    className="ip-crg-google-btn"
                    onClick={continueWithGoogle}
                    disabled={startingGoogle || loading}
                  >
                    <GoogleMark />
                    {startingGoogle ? 'Opening Google…' : 'Use a different Google account'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="ip-crg-body ip-crg-done">
              <div className="ip-crg-done-ico">
                <CheckCircle2 aria-hidden />
              </div>
              <h2>Registration complete</h2>
              <p>
                <strong>{done?.email}</strong> has been registered. A temporary password has been
                emailed to that address — use it to sign in, then change it under Account.
              </p>
              {done?.warning ? (
                <Alert>
                  <AlertDescription>{done.warning}</AlertDescription>
                </Alert>
              ) : null}

              <Link href="/" className="ip-crg-submit">
                Back to Sign In
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </main>

      <footer className="ip-crg-foot">InternSafar · Confidential · © 2026</footer>
    </div>
  );
}
