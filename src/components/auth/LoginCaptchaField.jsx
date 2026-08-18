'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { verifyCaptchaAnswer } from '@/lib/captchaClient';
import {
  CAPTCHA_BYPASS_FOR_TESTING,
  STATIC_CAPTCHA_BADGE,
  STATIC_CAPTCHA_QUESTION,
  STATIC_CAPTCHA_TOKEN,
} from '@/lib/captchaBypass';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ANTI_AUTOFILL = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
};

function sanitizeAnswer(value) {
  return String(value ?? '').replace(/[^\d-]/g, '');
}

/**
 * Login / register captcha.
 * Only the latest /api/auth/captcha response may update token+question — avoids
 * Strict Mode / double-fetch races where the UI shows Q2 but token is still Q1
 * (first submit fails; refresh+retry works).
 *
 * variant="securityCard" — PlacementHub IP login mock (slate-50 Security Card).
 */
const LoginCaptchaField = forwardRef(function LoginCaptchaField(
  {
    token,
    answer,
    onTokenChange,
    onAnswerChange,
    disabled = false,
    inputId = 'login-captcha',
    /** When true, verifies with the server on blur / Enter (registration). */
    verifyEarly = false,
    onVerifiedChange,
    /** `default` | `securityCard` (HTML redesign Security Verification card) */
    variant = 'default',
  },
  ref,
) {
  const [question, setQuestion] = useState(CAPTCHA_BYPASS_FOR_TESTING ? STATIC_CAPTCHA_QUESTION : '');
  const [dummyHint, setDummyHint] = useState('');
  const [loading, setLoading] = useState(!CAPTCHA_BYPASS_FOR_TESTING);
  const [verifyState, setVerifyState] = useState('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const verifyingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const abortRef = useRef(null);
  const tokenRef = useRef(CAPTCHA_BYPASS_FOR_TESTING ? STATIC_CAPTCHA_TOKEN : '');
  const inputRef = useRef(null);
  const [answerLocked, setAnswerLocked] = useState(!CAPTCHA_BYPASS_FOR_TESTING);
  const onTokenChangeRef = useRef(onTokenChange);
  const onAnswerChangeRef = useRef(onAnswerChange);
  const onVerifiedChangeRef = useRef(onVerifiedChange);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);
  useEffect(() => {
    onAnswerChangeRef.current = onAnswerChange;
  }, [onAnswerChange]);
  useEffect(() => {
    onVerifiedChangeRef.current = onVerifiedChange;
  }, [onVerifiedChange]);

  const unlockAnswer = () => setAnswerLocked(false);

  useImperativeHandle(ref, () => ({
    getChallenge() {
      const typed = sanitizeAnswer(inputRef.current?.value ?? answer).trim();
      return { token: tokenRef.current || token || '', answer: typed };
    },
  }));

  const setVerified = useCallback((ok) => {
    onVerifiedChangeRef.current?.(ok);
  }, []);

  const resetVerification = useCallback(() => {
    setVerifyState('idle');
    setVerifyMessage('');
    setVerified(false);
  }, [setVerified]);

  const runVerify = useCallback(async () => {
    const liveToken = tokenRef.current || token;
    if (!verifyEarly || !liveToken) {
      resetVerification();
      return false;
    }
    if (verifyingRef.current) return false;
    verifyingRef.current = true;
    setVerifyState('checking');
    setVerifyMessage('Checking answer…');
    const liveAnswer = sanitizeAnswer(inputRef.current?.value ?? answer);
    const result = await verifyCaptchaAnswer(liveToken, liveAnswer);
    verifyingRef.current = false;
    if (result.ok) {
      setVerifyState('valid');
      setVerifyMessage('Verified — you can continue.');
      setVerified(true);
      return true;
    }
    setVerifyState('invalid');
    setVerifyMessage(result.error || 'Incorrect answer. Try again or refresh the question.');
    setVerified(false);
    return false;
  }, [verifyEarly, token, answer, resetVerification, setVerified]);

  const loadChallenge = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    resetVerification();
    if (CAPTCHA_BYPASS_FOR_TESTING) {
      setLoading(false);
      setQuestion(STATIC_CAPTCHA_QUESTION);
      setDummyHint('');
      tokenRef.current = STATIC_CAPTCHA_TOKEN;
      onTokenChangeRef.current(STATIC_CAPTCHA_TOKEN);
      setAnswerLocked(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/captcha', { cache: 'no-store', signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (seq !== loadSeqRef.current) return;

      if (!res.ok) {
        setQuestion('Verification unavailable — refresh the page');
        setDummyHint('');
        onTokenChangeRef.current('');
        return;
      }
      setQuestion(data.question || 'Answer the question below');
      setDummyHint('');
      tokenRef.current = data.token || '';
      onTokenChangeRef.current(tokenRef.current);
      onAnswerChangeRef.current('');
      setAnswerLocked(true);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (seq !== loadSeqRef.current) return;
      setQuestion('Verification unavailable — refresh the page');
      onTokenChangeRef.current('');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [resetVerification]);

  useEffect(() => {
    void loadChallenge();
    return () => {
      loadSeqRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only load
  }, []);

  useEffect(() => {
    if (!verifyEarly) return;
    resetVerification();
  }, [answer, token, verifyEarly, resetVerification]);

  const handleAnswerChange = (value) => {
    onAnswerChange(sanitizeAnswer(value));
    if (verifyEarly) resetVerification();
  };

  /** Turn "What is 3 + 4?" into "3 + 4 = ?" for Security Card badge. */
  const equationBadge = (() => {
    const m = String(question || '').match(/(\d+)\s*\+\s*(\d+)/);
    if (m) return `${m[1]} + ${m[2]} = ?`;
    return loading ? '…' : question || '?';
  })();

  if (variant === 'securityCard') {
    return (
      <div
        className={cn(
          'ip-gemini-security',
          verifyState === 'valid' && 'border-emerald-200',
          verifyState === 'invalid' && 'border-red-300',
        )}
      >
        <div className="ip-gemini-security__head">
          <div className="ip-gemini-security__title">
            <ShieldCheck className="size-3.5 text-indigo-600" aria-hidden="true" />
            <span>Security Verification</span>
          </div>
          <button
            type="button"
            onClick={() => void loadChallenge()}
            disabled={disabled || loading}
            className="ip-gemini-security__refresh"
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} aria-hidden />
            New Code
          </button>
        </div>

        <div className="ip-gemini-security__row">
          <div className="ip-gemini-security__badge">
            {CAPTCHA_BYPASS_FOR_TESTING ? STATIC_CAPTCHA_BADGE : equationBadge}
          </div>
          <input
            ref={inputRef}
            id={inputId}
            name={`${inputId}-not-a-password`}
            type="text"
            inputMode="numeric"
            {...ANTI_AUTOFILL}
            readOnly={answerLocked}
            onFocus={unlockAnswer}
            placeholder="Answer"
            value={answer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            onInput={(e) => handleAnswerChange(e.currentTarget.value)}
            onBlur={() => {
              if (verifyEarly) void runVerify();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && verifyEarly) {
                e.preventDefault();
                void runVerify();
              }
            }}
            disabled={disabled || (!CAPTCHA_BYPASS_FOR_TESTING && (loading || !(tokenRef.current || token)))}
            aria-invalid={verifyState === 'invalid'}
            className={cn(
              'ip-gemini-security__answer',
              verifyState === 'invalid' && 'border-red-500',
              (disabled || (!CAPTCHA_BYPASS_FOR_TESTING && (loading || !(tokenRef.current || token)))) &&
                'cursor-not-allowed opacity-60',
            )}
          />
        </div>
        {verifyState === 'invalid' ? (
          <p className="m-0 text-[11px] font-medium text-red-600">Incorrect answer. Please try again.</p>
        ) : null}
        {verifyEarly && verifyMessage && verifyState !== 'invalid' ? (
          <p
            className={cn(
              'm-0 flex items-start gap-1.5 text-sm',
              verifyState === 'valid' && 'text-emerald-700',
              verifyState !== 'valid' && 'text-slate-500',
            )}
            role="status"
          >
            {verifyState === 'valid' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : null}
            {verifyMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Field
      className={cn(
        'bg-muted/40 gap-2 rounded-lg border p-3.5',
        verifyState === 'valid' && 'border-green-600/30',
        verifyState === 'invalid' && 'border-destructive/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={inputId} className="m-0 flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Verification
        </FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void loadChallenge()}
          disabled={disabled || loading}
          aria-label="New verification question"
          title="New question"
        >
          <RefreshCw />
        </Button>
      </div>
      <FieldDescription className="m-0">{loading ? 'Loading question…' : question}</FieldDescription>
      {dummyHint ? <p className="text-primary m-0 text-sm font-semibold">{dummyHint}</p> : null}
      <Input
        ref={inputRef}
        id={inputId}
        name={`${inputId}-not-a-password`}
        type="text"
        inputMode="numeric"
        {...ANTI_AUTOFILL}
        readOnly={answerLocked}
        onFocus={unlockAnswer}
        placeholder="Your answer"
        value={answer}
        onChange={(e) => handleAnswerChange(e.target.value)}
        onInput={(e) => handleAnswerChange(e.currentTarget.value)}
        onBlur={() => {
          if (verifyEarly) void runVerify();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && verifyEarly) {
            e.preventDefault();
            void runVerify();
          }
        }}
        disabled={disabled || (!CAPTCHA_BYPASS_FOR_TESTING && (loading || !(tokenRef.current || token)))}
        aria-invalid={verifyState === 'invalid'}
        aria-describedby={verifyEarly && verifyMessage ? `${inputId}-verify-status` : undefined}
      />
      {verifyEarly && verifyMessage ? (
        <p
          id={`${inputId}-verify-status`}
          className={cn(
            'm-0 flex items-start gap-1.5 text-sm leading-relaxed',
            verifyState === 'valid' && 'text-green-700 dark:text-green-400',
            verifyState === 'invalid' && 'text-destructive',
            verifyState !== 'valid' && verifyState !== 'invalid' && 'text-muted-foreground',
          )}
          role="status"
        >
          {verifyState === 'valid' ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : verifyState === 'invalid' ? (
            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : null}
          {verifyMessage}
        </p>
      ) : null}
    </Field>
  );
});

export default LoginCaptchaField;
