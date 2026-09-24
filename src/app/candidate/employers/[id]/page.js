'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function val(v) {
  const s = String(v || '').trim();
  return s || '—';
}

function hqParts(e) {
  return {
    city: val(e.hq_city),
    state: val(e.hq_state),
    country: val(e.hq_country),
    combined: [e.hq_city, e.hq_state, e.hq_country].filter(Boolean).join(', ') || '—',
  };
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}

export default function CandidateEmployerPublicPage() {
  const { id } = useParams();
  const [employer, setEmployer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/ip/candidate/employers/${encodeURIComponent(id)}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setEmployer(null);
          setError(data.error || 'Employer not found');
          return;
        }
        setEmployer(data.employer || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const hq = employer ? hqParts(employer) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" render={<Link href="/candidate/internships" />} nativeButton={false}>
          ← Back to internships
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading employer…</p> : null}

      {!loading && error ? (
        <Alert variant="destructive">
          <AlertTitle>Unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!loading && employer ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start gap-4">
              {employer.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={employer.logo_url}
                  alt=""
                  className="h-14 w-14 rounded-md border border-slate-200 object-contain bg-white"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl">{employer.company_name || 'Employer'}</CardTitle>
                <CardDescription>Approved employer on InternSafar</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name">{val(employer.company_name)}</Field>
              <Field label="Brand name">{val(employer.brand_name)}</Field>
              <Field label="Legal name">{val(employer.legal_name)}</Field>
              <Field label="Industry">{val(employer.industry)}</Field>
              <Field label="Company size">{val(employer.company_size)}</Field>
              <Field label="Headquarters">{hq.combined}</Field>
              <Field label="HQ city">{hq.city}</Field>
              <Field label="HQ state / UT">{hq.state}</Field>
              <Field label="HQ country">{hq.country}</Field>
              <Field label="Website">
                {employer.website ? (
                  <a href={employer.website} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline-offset-2 hover:underline">
                    {employer.website}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="LinkedIn">
                {employer.linkedin_url ? (
                  <a href={employer.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline-offset-2 hover:underline">
                    {employer.linkedin_url}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="Primary contact">{val(employer.contact_name)}</Field>
              <Field label="Contact role">{val(employer.contact_designation)}</Field>
            </dl>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About the company</h2>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">
                {String(employer.about || '').trim() || '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
