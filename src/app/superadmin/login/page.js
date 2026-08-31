'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AuthShell from '@/components/ip/AuthShell';
import { readCaptchaField, verifyCaptchaAnswer } from '@/lib/captchaClient';
import { CAPTCHA_BYPASS_FOR_TESTING, STATIC_CAPTCHA_TOKEN } from '@/lib/captchaBypass';

export default function SuperAdminLoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  // Shared by the password and OTP submits: this page must refuse non-superadmins either way.
  async function finishLogin() {
    const sess = await fetch('/api/auth/session').then((r) => r.json());
    if (sess?.user?.role !== 'superadmin') {
      setError('This account is not a SuperAdmin account.');
      return;
    }
    router.replace('/superadmin');
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

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'superadmin') {
      router.replace('/superadmin');
    }
  }, [status, session, router]);

  async function onLogin(e) {
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
    <AuthShell
      brand="Internship Portal"
      subtitle="Restricted SuperAdmin access"
      mark="SA"
      markClassName="bg-destructive text-destructive-foreground"
    >
      <Card className="border-border/80 shadow-sm border-t-4 border-t-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">
            {otpStep ? 'Two-factor verification' : 'SuperAdmin login'}
          </CardTitle>
          <CardDescription>
            {otpStep ? 'Enter the 6-digit code we emailed you.' : 'Separate from candidate/employer login.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {otpStep ? (
            <form className="space-y-4" onSubmit={onSubmitOtp}>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {otpHint ? (
                <Alert>
                  <AlertDescription>{otpHint}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="sa-otp">Verification code</FieldLabel>
                <Input
                  id="sa-otp"
                  name="sa-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" variant="destructive" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & continue'}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={resendOtp} disabled={loading}>
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
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
                </Button>
              </div>
            </form>
          ) : (
          <form className="space-y-4" onSubmit={onLogin}>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="sa-email">Email</FieldLabel>
              <Input id="sa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="sa-password">Password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="sa-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    size="icon-xs"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <LoginCaptchaField
              ref={captchaFieldRef}
              token={captchaToken}
              answer={captchaAnswer}
              onTokenChange={setCaptchaToken}
              onAnswerChange={setCaptchaAnswer}
            />
            <Button type="submit" className="w-full" variant="destructive" disabled={loading}>
              {loading ? 'Signing in…' : 'Login'}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
