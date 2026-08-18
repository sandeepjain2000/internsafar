import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { POSTING_GUIDELINES } from '@/lib/ipConstants';
import PageHeader from '@/components/ip/PageHeader';

export default function GuidelinesPage() {
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
          title="Internship posting guidelines"
          description="Employers must accept each statement before publishing an internship."
        />
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Required confirmations</CardTitle>
            <CardDescription>Shown on every internship post form.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
              {POSTING_GUIDELINES.map((g) => (
                <li key={g.id}>{g.label}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
