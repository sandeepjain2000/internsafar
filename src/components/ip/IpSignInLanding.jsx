'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { readCaptchaField, verifyCaptchaAnswer } from '@/lib/captchaClient';
import { CAPTCHA_BYPASS_FOR_TESTING, STATIC_CAPTCHA_TOKEN } from '@/lib/captchaBypass';
import { ROLE_HOME } from '@/lib/roleHome';
import './ip-login-gemini.css';

const HERO_POINTS = [
  'Direct employer matching for verified corporate roles',
  'Verified logbooks with real-time progress tracking',
  'Automated supervisor evaluations & carry-forward records',
  'Comprehensive reports with integrated skill analytics',
];

function BrandMark({ variant = 'dark' }) {
  const dark = variant === 'dark';
  return (
    <div className={`ip-login-brand${dark ? ' ip-login-brand--on-dark' : ''}`}>
      <span className="ip-login-brand__mark">
        <Image src="/logo-icon.png" alt="" width={88} height={88} className="size-full object-cover" priority />
      </span>
      <span className="ip-login-brand__lockup">
        <span className="ip-login-brand__text">
          Placement<span className="hub">Hub</span>
        </span>
        {dark ? <span className="ip-login-brand__sub">Enterprise Portal</span> : null}
      </span>
    </div>
  );
}

export default function IpSignInLanding() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaFieldRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');

  useEffect(() => {
    fetch('/api/ip/bootstrap', { method: 'POST' }).catch(() => {});
  }, []);

  function parseTwoFactorRequired(err) {
    const raw = decodeURIComponent(String(err || ''));
    const m = raw.match(/TWO_FACTOR_REQUIRED:([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  async function finishLogin() {
    const sess = await fetch('/api/auth/session').then((r) => r.json());
    const role = sess?.user?.role;
    router.push(ROLE_HOME[role] || '/');
  }

  async function onSubmitOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        otpChallengeId,
        otpCode: otpCode.trim(),
        rememberMe: rememberMe ? 'true' : 'false',
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/ip/auth/2fa/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: otpChallengeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not resend code');
        return;
      }
      if (data.challengeId) setOtpChallengeId(data.challengeId);
      setOtpHint(data.sentToHint ? `Code sent (check ${data.sentToHint})` : 'Code sent');
      setOtpCode('');
    } catch (err) {
      setError(err.message || 'Could not resend code');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challenge = readCaptchaField(captchaFieldRef, captchaToken, captchaAnswer);
      let captchaTokenToSend = challenge.token || STATIC_CAPTCHA_TOKEN;
      let captchaAnswerToSend = challenge.answer || '0';
      if (!CAPTCHA_BYPASS_FOR_TESTING) {
        if (!challenge.token) {
          setError('Verification is still loading. Wait a moment, then try again.');
          return;
        }
        const check = await verifyCaptchaAnswer(challenge.token, challenge.answer);
        if (!check.ok) {
          setError(check.error || 'Incorrect verification answer. Refresh the question and try again.');
          return;
        }
        captchaTokenToSend = check.gate || challenge.token;
        captchaAnswerToSend = check.gate ? '1' : challenge.answer;
      }
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
        captchaToken: captchaTokenToSend,
        captchaAnswer: captchaAnswerToSend,
        rememberMe: rememberMe ? 'true' : 'false',
      });
      if (res?.error) {
        const challengeId = parseTwoFactorRequired(res.error);
        if (challengeId) {
          setOtpChallengeId(challengeId);
          setOtpStep(true);
          setOtpCode('');
          setOtpHint('We emailed a 6-digit code. Check your inbox (or QA override inbox if configured).');
          setError('');
          return;
        }
        setError(res.error);
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ip-gemini-login flex min-h-svh flex-col">
      <div className="grid min-h-svh flex-1 lg:grid-cols-12">
        <div className="ip-gemini-hero relative hidden overflow-hidden p-8 text-white lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-14">
          <div className="ip-gemini-hero__glow ip-gemini-hero__glow--tl" aria-hidden />
          <div className="ip-gemini-hero__glow ip-gemini-hero__glow--br" aria-hidden />

          <div className="relative z-10 space-y-8">
            <BrandMark variant="dark" />

            <div>
              <div className="ip-gemini-hero__pill">
                <span className="ip-gemini-hero__dot" aria-hidden />
                Internship &amp; Career Management
              </div>
              <h1 className="ip-gemini-hero__title">
                Beyond Placements.
                <br />
                Building Industry-Ready Talent.
              </h1>
              <p className="ip-gemini-hero__lede">
                Access top-tier internship opportunities, real-time application analytics, automated verification, and
                seamless mentor evaluations — all in one place.
              </p>
            </div>

            <ul className="ip-gemini-hero__list">
              {HERO_POINTS.map((line) => (
                <li key={line}>
                  <span className="ip-gemini-hero__check" aria-hidden>
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="ip-gemini-hero__foot">Enterprise Career Portal</p>
        </div>

        <div className="ip-gemini-form-col flex flex-col justify-between p-6 sm:p-12 lg:col-span-7 lg:p-16">
          <div className="mb-6 lg:hidden">
            <BrandMark variant="light" />
          </div>

          <div className="mx-auto my-auto flex w-full max-w-md flex-col gap-7">
            <div className="flex flex-col gap-1.5">
              <h2>Sign in to your account</h2>
              <p className="ip-gemini-sub">Enter your email address and password to continue.</p>
            </div>

            <form className="flex flex-col gap-5" onSubmit={otpStep ? onSubmitOtp : onSubmit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>{otpStep ? 'Verification failed' : 'Sign in failed'}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {otpStep ? (
                <>
                  <Alert>
                    <AlertTitle>Two-factor verification</AlertTitle>
                    <AlertDescription>
                      {otpHint || 'Enter the 6-digit code we emailed you.'}
                    </AlertDescription>
                  </Alert>
                  <div className="ip-gemini-field">
                    <label htmlFor="otp">Email verification code</label>
                    <div className="ip-gemini-input-wrap">
                      <span className="ip-gemini-icon-left">
                        <Lock className="size-4" aria-hidden />
                      </span>
                      <input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        maxLength={6}
                        pattern="[0-9]{6}"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                        className="ip-gemini-input"
                        autoFocus
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={loading || otpCode.length !== 6} className="ip-gemini-submit">
                    {loading ? 'Verifying…' : 'Verify & continue'}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <button type="button" className="ip-gemini-link" disabled={loading} onClick={resendOtp}>
                      Resend code
                    </button>
                    <button
                      type="button"
                      className="ip-gemini-link"
                      disabled={loading}
                      onClick={() => {
                        setOtpStep(false);
                        setOtpChallengeId('');
                        setOtpCode('');
                        setOtpHint('');
                        setError('');
                      }}
                    >
                      Back to password
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ip-gemini-field">
                    <label htmlFor="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="ip-gemini-input ip-gemini-input--plain"
                    />
                  </div>

                  <div className="ip-gemini-field">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password">Password</label>
                      <Link href="/forgot-password" className="ip-gemini-link">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="ip-gemini-input-wrap">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="ip-gemini-input ip-gemini-input--plain ip-gemini-input--password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="ip-gemini-icon-right"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
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

                  <div className="ip-gemini-remember">
                    <input
                      type="checkbox"
                      id="remember"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <label htmlFor="remember">Remember this device for 30 days</label>
                  </div>

                  <button type="submit" disabled={loading} className="ip-gemini-submit">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Verifying credentials...
                      </span>
                    ) : (
                      '→ Sign In'
                    )}
                  </button>
                </>
              )}
            </form>

            <div className="ip-gemini-register-callout">
              <p>
                New to PlacementHub?{' '}
                <Link href="/register" className="ip-gemini-link-strong">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          <p className="ip-gemini-page-foot">PlacementHub · Confidential · © 2026</p>
        </div>
      </div>
    </div>
  );
}
