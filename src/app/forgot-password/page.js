'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import LoginCaptchaField from '@/components/auth/LoginCaptchaField';
import { readCaptchaField } from '@/lib/captchaClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AuthShell from '@/components/ip/AuthShell';

function ForgotInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaFieldRef = useRef(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function requestReset(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const challenge = readCaptchaField(captchaFieldRef, captchaToken, captchaAnswer);
    const res = await fetch('/api/ip/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, captchaToken: challenge.token, captchaAnswer: challenge.answer }),
    });
    const data = await res.json();
    if (!res.ok) setErr(data.error || 'Failed');
    else setMsg(data.message || 'If the email exists, a reset link was sent via ZeptoMail.');
  }

  async function confirmReset(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const res = await fetch('/api/ip/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) setErr(data.error || 'Failed');
    else setMsg('Password updated. You can sign in.');
  }

  return (
    <AuthShell subtitle="Reset your password via email">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{token ? 'Set new password' : 'Forgot password'}</CardTitle>
          <CardDescription>Reset link is emailed via ZeptoMail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {msg ? (
            <Alert>
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          ) : null}
          {err ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          ) : null}
          {token ? (
            <form className="space-y-3" onSubmit={confirmReset}>
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full">
                Update password
              </Button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={requestReset}>
              <Field>
                <FieldLabel htmlFor="reset-email">Email</FieldLabel>
                <Input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <LoginCaptchaField
                ref={captchaFieldRef}
                token={captchaToken}
                answer={captchaAnswer}
                onTokenChange={setCaptchaToken}
                onAnswerChange={setCaptchaAnswer}
              />
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading…</div>
      }
    >
      <ForgotInner />
    </Suspense>
  );
}
