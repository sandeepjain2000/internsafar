import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/ip/PageHeader';

const STEPS = [
  {
    t: '1. Employer registers',
    b: 'Domain path (matching website + work email) or Form request for SuperAdmin. Password is emailed for domain path.',
  },
  {
    t: '2. Candidate registers',
    b: 'Continue with Google → Gmail only → temporary password emailed → sign in on the landing page.',
  },
  {
    t: '3. Approvals & profile',
    b: 'Employers complete ethics + docs; SuperAdmin approves. Candidates complete profile basics to apply.',
  },
  {
    t: '4. Post, apply, message, hire',
    b: 'Employers post using points/credits; candidates browse/apply; both use email-style messages and mutual ratings after offers.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-100)_0%,_transparent_55%)]"
      />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-10">
        <Button variant="ghost" size="sm" className="mb-4" render={<Link href="/" />}>
          ← Home
        </Button>
        <PageHeader
          title="How Internship Portal works"
          description="Focused internship hiring with referrals, viral shares, and mutual ratings."
        />
        <div className="flex flex-col gap-4">
          {STEPS.map((s) => (
            <Card key={s.t} className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{s.t}</CardTitle>
                <CardDescription>{s.b}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button render={<Link href="/" />}>Sign in</Button>
          <Button variant="secondary" render={<Link href="/register" />}>
            Register
          </Button>
        </div>
      </div>
    </div>
  );
}
