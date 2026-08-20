'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Gift,
  GraduationCap,
  Key,
  Mail,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import { isGmailAddress, normalizeEmail } from '@/lib/authRegisterRules';
import { readCaptchaField } from '@/lib/captchaClient';
import { CAPTCHA_BYPASS_FOR_TESTING } from '@/lib/captchaBypass';
import { REFERRAL_POINTS } from '@/lib/pointsEconomy';
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState(urlRef);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaFieldRef = useRef(null);
  const [step, setStep] = useState('form');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch('/api/ip/bootstrap', { method: 'POST' }).catch(() => {});
  }, []);

  const domainIssue = useMemo(() => {
    const domain = emailDomain(email);
    if (!domain) return '';
    if (isGmailAddress(email)) return '';
    return domain;
  }, [email]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!isGmailAddress(email)) {
      setError(
        'Only personal @gmail.com or @googlemail.com addresses are allowed for candidate registration.',
      );
      return;
    }
    const challenge = readCaptchaField(captchaFieldRef, captchaToken, captchaAnswer);
    if (!CAPTCHA_BYPASS_FOR_TESTING && (!challenge.token || !String(challenge.answer || '').trim())) {
      setError('Complete the security verification question.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/ip/auth/register-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'google',
          name: name.trim(),
          email,
          captchaToken: challenge.token,
          captchaAnswer: challenge.answer,
          referralCode: referralCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setDone({
        name: name.trim(),
        email: normalizeEmail(email),
        startingPoints: Number(data.startingPoints || 50),
        referralApplied: Boolean(data.referralApplied),
        message: data.message || 'Account created. Temporary password emailed to your Gmail.',
        warning: data.warning || '',
      });
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
                    Institutional or university email addresses (e.g., @vit.edu, @mit.edu) are not
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

              <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="ip-crg-field">
                  <label htmlFor="name">
                    Full Name <span className="req">*</span>
                  </label>
                  <div className="ip-crg-input-wrap">
                    <User aria-hidden />
                    <input
                      id="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Johnson"
                    />
                  </div>
                </div>

                <div className="ip-crg-field">
                  <label htmlFor="google-email">
                    Gmail / Googlemail Address <span className="req">*</span>
                  </label>
                  <div className="ip-crg-input-wrap">
                    <Mail aria-hidden />
                    <input
                      id="google-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                    />
                  </div>
                  <p className="ip-crg-hint">Only personal @gmail.com or @googlemail.com accounts are allowed.</p>
                  {domainIssue ? (
                    <div className="ip-crg-domain-err" role="alert">
                      <strong>
                        <XCircle aria-hidden />
                        Institutional domains not supported
                      </strong>
                      <p>
                        Addresses such as @{domainIssue} are not permitted. Use a personal @gmail.com or
                        @googlemail.com account.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="ip-crg-field">
                  <div className="ip-crg-ref-row">
                    <label htmlFor="referralCode">
                      Referral Code <span className="opt">(Optional)</span>
                    </label>
                    {referralCode.trim().length >= 3 ? (
                      <span className="ip-crg-ref-badge">Code will be applied if it is valid</span>
                    ) : null}
                  </div>
                  <div className="ip-crg-input-wrap">
                    <Gift aria-hidden />
                    <input
                      id="referralCode"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="e.g. CAMPUS2026"
                      autoComplete="off"
                    />
                  </div>
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

                <button type="submit" className="ip-crg-submit" disabled={loading || Boolean(domainIssue)}>
                  <GoogleMark />
                  {loading ? 'Creating account…' : 'Create account with Gmail'}
                </button>
                <p className="ip-crg-legal">
                  A temporary password is emailed to this Gmail. Sign in with email and that password —
                  there is no Google sign-in button on the login page.
                </p>
              </form>
            </div>
          ) : (
            <div className="ip-crg-body ip-crg-done">
              <div className="ip-crg-done-ico">
                <CheckCircle2 aria-hidden />
              </div>
              <h2>Candidate Account Created!</h2>
              <p>
                Welcome{done?.name ? `, ${done.name}` : ''}. Your account is ready. Sign in with the
                temporary password sent to your Gmail.
              </p>
              {done?.warning ? (
                <Alert>
                  <AlertDescription>{done.warning}</AlertDescription>
                </Alert>
              ) : null}

              <div className="ip-crg-summary">
                <div className="ip-crg-summary-row">
                  <span>Full Name</span>
                  <strong>{done?.name || '—'}</strong>
                </div>
                <div className="ip-crg-summary-row">
                  <span>Registered Gmail</span>
                  <strong>{done?.email || '—'}</strong>
                </div>
                <div className="ip-crg-summary-row">
                  <span>Authentication</span>
                  <strong>Gmail + emailed password</strong>
                </div>
              </div>

              <div className="ip-crg-mail">
                <h3>
                  <Key aria-hidden />
                  Temporary initial password sent
                </h3>
                <p>
                  A temporary password has been emailed to <strong>{done?.email}</strong>. Use it on
                  the sign-in page, then change it under Account.
                </p>
              </div>

              <div className="ip-crg-points">
                <div className="ip-crg-points-head">
                  <span>Starting points</span>
                  <span className="ip-crg-points-pill">{done?.startingPoints || 50} points</span>
                </div>
                <ul>
                  <li>
                    <span>Signup balance</span>
                    <span>+{done?.startingPoints || 50}</span>
                  </li>
                  {done?.referralApplied ? (
                    <li>
                      <span>Referral applied</span>
                      <span>Referrer earns +{REFERRAL_POINTS}</span>
                    </li>
                  ) : null}
                </ul>
              </div>

              <Link href="/" className="ip-crg-submit">
                Proceed to Sign In
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
