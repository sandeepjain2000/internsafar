import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PageHeader from '@/components/ip/PageHeader';

const TOPICS = [
  {
    t: 'Signing in',
    b: 'Use the home page login with your emailed password. CAPTCHA is required. Candidates use Gmail; employers use work email.',
  },
  {
    t: 'Employer verification',
    b: 'Complete Profile & docs (including ethics). SuperAdmin must approve before live posts.',
  },
  {
    t: 'Messaging',
    b: 'Messages use an email-style inbox (subject = last message), not Internshala chat bubbles.',
  },
  {
    t: 'Guidelines & ethics',
    b: 'Every internship post requires accepting fairness guidelines. Employers also accept ethics checkboxes on profile.',
  },
];

export default function HelpCenterPage() {
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
        <PageHeader title="Help Center" description="Quick answers for Internship Portal. No live support tickets." />
        <div className="flex flex-col gap-4">
          {TOPICS.map((s) => (
            <Card key={s.t} className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{s.t}</CardTitle>
                <CardDescription>{s.b}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
