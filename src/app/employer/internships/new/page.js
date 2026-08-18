'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ip/PageHeader';

export default function NewInternshipPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '', description: '', location: '', workMode: 'Remote', stipendInr: '', durationMonths: '',
    startDate: '', endDate: '', skills: '', degree: '', minCgpa: '',
    workHoursStart: '', workHoursEnd: '', engagementType: '', weeklyHours: '',
    stipendType: '', incentiveBasis: '',
  });
  const [screeningQuestions, setScreeningQuestions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addScreeningQuestion() {
    setScreeningQuestions((qs) => [...qs, '']);
  }

  function updateScreeningQuestion(idx, value) {
    setScreeningQuestions((qs) => qs.map((q, i) => (i === idx ? value : q)));
  }

  function removeScreeningQuestion(idx) {
    setScreeningQuestions((qs) => qs.filter((_, i) => i !== idx));
  }

  async function submit(e, status) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/ip/employer/internships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          stipendInr: form.stipendInr ? Number(form.stipendInr) : null,
          durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
          weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : null,
          status,
          eligibility: {
            skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
            degree: form.degree || undefined,
            minCgpa: form.minCgpa || undefined,
          },
          questions: screeningQuestions
            .map((prompt, idx) => ({ id: `q${idx + 1}`, prompt: String(prompt || '').trim(), type: 'text' }))
            .filter((q) => q.prompt),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/employer/internships');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Post an internship"
        description="Hours, engagement, and compensation-type fields are optional. Eligibility never blocks applications."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posting details</CardTitle>
          <CardDescription>Tabbed form to keep the page compact</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => submit(e, 'published')}>
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Tabs defaultValue="details">
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
                <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
                <TabsTrigger value="screening">Screening</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
                <Field><FieldLabel>Location</FieldLabel><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
                <Field><FieldLabel>Work mode</FieldLabel><Input value={form.workMode} onChange={(e) => set('workMode', e.target.value)} placeholder="Remote / Hybrid / On-site" /></Field>
                <Field><FieldLabel>Duration (months)</FieldLabel><Input type="number" value={form.durationMonths} onChange={(e) => set('durationMonths', e.target.value)} /></Field>
                <Field><FieldLabel>Start date</FieldLabel><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
                <Field><FieldLabel>End date</FieldLabel><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="hours" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Working hours range (optional)</FieldLabel>
                  <FieldDescription>
                    Daily availability window for the role — not internship length. Examples: 10:00–18:00, 18:00–22:00.
                  </FieldDescription>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Input type="time" className="w-36" value={form.workHoursStart} onChange={(e) => set('workHoursStart', e.target.value)} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" className="w-36" value={form.workHoursEnd} onChange={(e) => set('workHoursEnd', e.target.value)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Full-time or part-time</FieldLabel>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={form.engagementType}
                    onChange={(e) => set('engagementType', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                  </select>
                </Field>
                {form.engagementType === 'part_time' ? (
                  <Field>
                    <FieldLabel>Weekly hours</FieldLabel>
                    <FieldDescription>Approximate hours per week for part-time roles.</FieldDescription>
                    <Input type="number" min={1} max={40} value={form.weeklyHours} onChange={(e) => set('weeklyHours', e.target.value)} placeholder="e.g. 15" />
                  </Field>
                ) : null}
              </TabsContent>

              <TabsContent value="pay" className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Stipend type</FieldLabel>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={form.stipendType}
                    onChange={(e) => set('stipendType', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="fixed">Fixed stipend</option>
                    <option value="incentive">Incentive-based</option>
                  </select>
                </Field>
                {form.stipendType !== 'incentive' ? (
                  <Field>
                    <FieldLabel>Stipend (INR / month)</FieldLabel>
                    <Input type="number" value={form.stipendInr} onChange={(e) => set('stipendInr', e.target.value)} />
                  </Field>
                ) : (
                  <Field className="sm:col-span-2">
                    <FieldLabel>Incentive basis</FieldLabel>
                    <FieldDescription>How incentive pay is calculated (e.g. per deliverable, milestone, commission tier).</FieldDescription>
                    <Textarea rows={3} value={form.incentiveBasis} onChange={(e) => set('incentiveBasis', e.target.value)} placeholder="Describe the calculation basis…" />
                  </Field>
                )}
              </TabsContent>

              <TabsContent value="eligibility" className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel>Eligibility: degree</FieldLabel><Input value={form.degree} onChange={(e) => set('degree', e.target.value)} /></Field>
                <Field><FieldLabel>Eligibility: min CGPA</FieldLabel><Input value={form.minCgpa} onChange={(e) => set('minCgpa', e.target.value)} /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Preferred skills (comma separated)</FieldLabel><Input value={form.skills} onChange={(e) => set('skills', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="screening" className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Optional. Zero questions is fine. If you add any, candidates must answer all to apply.
                </p>
                {screeningQuestions.map((q, idx) => (
                  <Field key={`sq-${idx}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <FieldLabel>Question {idx + 1}</FieldLabel>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeScreeningQuestion(idx)}>
                        Remove
                      </Button>
                    </div>
                    <Input
                      value={q}
                      onChange={(e) => updateScreeningQuestion(idx, e.target.value)}
                      placeholder="e.g. Why this internship?"
                    />
                  </Field>
                ))}
                <Button type="button" variant="outline" onClick={addScreeningQuestion}>
                  Add screening question
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish now'}</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={(e) => submit(e, 'draft')}>Save as draft</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
