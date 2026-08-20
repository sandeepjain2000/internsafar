'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, Building2, CheckCircle2, GraduationCap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import '@/components/ip/ip-register-gemini.css';

function RegisterChooserInner() {
  const sp = useSearchParams();
  const ref = sp.get('ref');
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';

  return (
    <div className="ip-gemini-register">
      <header className="ip-reg-topbar">
        <IpGeminiBrand href="/" subtitle="Enterprise Portal" />
        <div className="ip-reg-topbar-signin">
          <span>Already have an account?</span>
          <Link href="/" className="ip-reg-signin-btn">
            Sign In
          </Link>
        </div>
      </header>

      <div className="ip-reg-page">
        <div className="ip-reg-hero">
          <h1>Create your account</h1>
          <p>Choose how you will use InternSafar to continue.</p>
        </div>

        {ref ? (
          <div className="mb-6 w-full max-w-3xl">
            <Alert>
              <AlertDescription>
                Referral code applied: <code className="font-mono text-xs">{ref}</code>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="ip-reg-cards">
          <Link href={`/register/candidate${q}`} className="ip-reg-card">
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="ip-reg-card__icon">
                  <GraduationCap className="size-6" aria-hidden />
                </span>
                <span className="ip-reg-card__badge">Candidate Access</span>
              </div>
              <h3>Register as Candidate</h3>
              <p className="ip-reg-card__desc">
                For university students, graduates, and interns looking for internships, placements and
                career opportunities.
              </p>
              <ul>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Create a candidate profile</span>
                </li>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Track applications, messages, and offers</span>
                </li>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Gmail signup — temporary password emailed to you</span>
                </li>
              </ul>
            </div>
            <div className="ip-reg-card__cta">
              <span>Continue as Candidate</span>
              <ArrowRight className="size-4" aria-hidden />
            </div>
          </Link>

          <Link href={`/register/employer${q}`} className="ip-reg-card ip-reg-card--employer">
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="ip-reg-card__icon ip-reg-card__icon--employer">
                  <Building2 className="size-6" aria-hidden />
                </span>
                <span className="ip-reg-card__badge ip-reg-card__badge--employer">Corporate Access</span>
              </div>
              <h3>Register as Employer</h3>
              <p className="ip-reg-card__desc">
                For companies and recruiters looking to post opportunities and hire talent.
              </p>
              <ul>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Submit company details for review</span>
                </li>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Post internships and manage applications</span>
                </li>
                <li>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>Domain register or SuperAdmin review form</span>
                </li>
              </ul>
            </div>
            <div className="ip-reg-card__cta">
              <span>Continue as Employer</span>
              <ArrowRight className="size-4" aria-hidden />
            </div>
          </Link>
        </div>

        <p className="ip-reg-footer-note">
          Already have an account?{' '}
          <Link href="/" className="ip-reg-link">
            Sign in to your portal
          </Link>
        </p>
      </div>

      <footer className="ip-reg-site-footer">InternSafar · Confidential · © 2026</footer>
    </div>
  );
}

export default function RegisterChooserPage() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center text-slate-500">Loading…</div>}>
      <RegisterChooserInner />
    </Suspense>
  );
}
