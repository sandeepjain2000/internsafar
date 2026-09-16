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
  {
    bold: 'Discover verified internship opportunities',
    rest: ' matched to your skills, interests, location, and preferred work mode',
  },
  {
    bold: 'Apply with confidence',
    rest: ' to opportunities from approved employers and keep track of every application in one place',
  },
  {
    bold: 'Stay connected with employers',
    rest: ' through direct messaging and timely updates throughout the application process',
  },
  {
    bold: 'Track your internship journey',
    rest: ' from selection to participation and completion, with support when you need it',
  },
];

function BrandMark({ variant = 'dark' }) {
  const dark = variant === 'dark';
  return (
    <div className={`ip-login-brand${dark ? ' ip-login-brand--on-dark' : ''}`}>
      <span className="ip-login-brand__mark">
        <Image
          src="/internsafar-icon.png"
          alt=""
          width={88}
          height={88}
          className="size-full object-contain"
          priority
        />
      </span>
      <span className="ip-login-brand__lockup">
        <span className="ip-login-brand__text">
          Intern<span className="hub">Safar</span>
        </span>
      </span>
    </div>
  );
}

const GOOGLE_AUTH_ERRORS = {
  GoogleLoginDisabled:
    'Google sign-in is not available for that account. Use email and password, or register with Google first.',
  GoogleAccountNotLinked:
    'No InternSafar account is linked to that Google account yet. Create an account with Sign up with Google first.',
  GoogleAccountInactive: 'That account is inactive. Contact support if you need help.',
  GoogleNoEmail: 'Google did not return an email address. Try another Google account or use email sign-in.',
  GoogleEmailUnverified:
    'That Google email is not verified. Verify it in Google or register with email instead.',
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
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
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const captchaFieldRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [startingGoogle, setStartingGoogle] = useState(false);
  const [googleReady, setGoogleReady] = useState(true);

  useEffect(() => {
    fetch('/api/ip/bootstrap', { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((providers) => setGoogleReady(Boolean(providers?.google)))
      .catch(() => setGoogleReady(false));
  }, []);

  // Read ?error= from the URL without useSearchParams — that API forces a client-only
  // bailout (BAILOUT_TO_CLIENT_SIDE_RENDERING) so production SSR only shipped "Loading…"
  // until JS hydrated. Google Auth must remain usable from the first HTML paint.
  useEffect(() => {
    try {
      const authError = new URLSearchParams(window.location.search).get('error');
      if (authError && GOOGLE_AUTH_ERRORS[authError]) {
        setError(GOOGLE_AUTH_ERRORS[authError]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function continueWithGoogle() {
    setError('');
    setStartingGoogle(true);
    try {
      // No registration intent cookie — auth.js treats this as linked-account login.
      await signIn('google', { callbackUrl: '/app' });
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setStartingGoogle(false);
    }
  }

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
        <div className="ip-gemini-hero relative hidden overflow-hidden p-8 text-white lg:col-span-3 lg:flex lg:flex-col lg:justify-between lg:p-10">
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
                <strong>Turn opportunities into real experience.</strong>
              </h1>
              <p className="ip-gemini-hero__lede">
                Discover verified internships, connect with approved employers, manage every application, and stay on
                top of your internship journey — all in one place.
              </p>
            </div>

            <ul className="ip-gemini-hero__list">
              {HERO_POINTS.map(({ bold, rest }) => (
                <li key={bold}>
                  <span className="ip-gemini-hero__check" aria-hidden>
                    ✓
                  </span>
                  <span>
                    <strong>{bold}</strong>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="ip-gemini-hero__foot">Enterprise Career Portal</p>
        </div>

        <div className="ip-gemini-form-col flex flex-col justify-between p-6 sm:p-12 lg:col-span-9 lg:p-16">
          <div className="mb-6 lg:hidden">
            <BrandMark variant="light" />
          </div>

          <div className="mx-auto my-auto flex w-full max-w-md flex-col gap-7">
            <div className="flex flex-col gap-1.5">
              <h2>Sign in to your account</h2>
              <p className="ip-gemini-sub">Use Google (if you registered with Google) or email and password.</p>
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
                  {googleReady ? (
                    <button
                      type="button"
                      className="ip-gemini-google-btn"
                      onClick={continueWithGoogle}
                      disabled={loading || startingGoogle}
                    >
                      <GoogleMark />
                      {startingGoogle ? 'Opening Google…' : 'Sign in with Google'}
                    </button>
                  ) : (
                    <Alert className="mb-3">
                      <AlertTitle>Google sign-in unavailable</AlertTitle>
                      <AlertDescription>
                        Google Auth is not configured on this environment. Use email and password,
                        or ask an admin to set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="ip-gemini-or" role="separator" aria-label="Or continue with email">
                    <span>Or with email</span>
                  </div>

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
                    onLoadingChange={setCaptchaLoading}
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

                  <button
                    type="submit"
                    disabled={loading || captchaLoading || (!CAPTCHA_BYPASS_FOR_TESTING && !captchaToken)}
                    className="ip-gemini-submit"
                  >
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
                New to InternSafar?{' '}
                <Link href="/register" className="ip-gemini-link-strong">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          <nav className="ip-gemini-info-links" aria-label="Learn more">
            <Link href="/how-it-works">How it works</Link>
            <span aria-hidden="true">·</span>
            <Link href="/help">Help Center</Link>
          </nav>

          <p className="ip-gemini-page-foot">InternSafar · Confidential · © 2026</p>
        </div>
      </div>
    </div>
  );
}
