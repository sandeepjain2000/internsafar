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

  useEffect(() => {
    fetch('/api/ip/bootstrap', { method: 'POST' }).catch(() => {});
  }, []);

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
        setError(res.error);
        return;
      }
      const sess = await fetch('/api/auth/session').then((r) => r.json());
      if (sess?.user?.role !== 'superadmin') {
        setError('This account is not a SuperAdmin account.');
        return;
      }
      router.replace('/superadmin');
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
          <CardTitle className="text-destructive">SuperAdmin login</CardTitle>
          <CardDescription>Separate from candidate/employer login.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </AuthShell>
  );
}
