'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ip/PageHeader';

export default function EditInternshipPage() {
  const { id } = useParams();
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/ip/employer/internships/${id}`).then((r) => r.json()).then((d) => setForm(d.internship));
  }, [id]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/employer/internships/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          location: form.location,
          work_mode: form.work_mode,
          stipend_inr: form.stipend_inr ? Number(form.stipend_inr) : null,
          duration_months: form.duration_months ? Number(form.duration_months) : null,
          start_date: form.start_date,
          end_date: form.end_date,
          work_hours_start: form.work_hours_start || null,
          work_hours_end: form.work_hours_end || null,
          engagement_type: form.engagement_type || null,
          weekly_hours: form.engagement_type === 'part_time' && form.weekly_hours
            ? Number(form.weekly_hours)
            : null,
          stipend_type: form.stipend_type || null,
          incentive_basis: form.stipend_type === 'incentive' ? (form.incentive_basis || null) : null,
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

  if (!form) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Edit posting" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Hours, engagement, and compensation type are optional</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save}>
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Tabs defaultValue="details">
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} required /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea rows={4} value={form.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
                <Field><FieldLabel>Location</FieldLabel><Input value={form.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
                <Field><FieldLabel>Work mode</FieldLabel><Input value={form.work_mode || ''} onChange={(e) => set('work_mode', e.target.value)} /></Field>
                <Field><FieldLabel>Duration (months)</FieldLabel><Input type="number" value={form.duration_months || ''} onChange={(e) => set('duration_months', e.target.value)} /></Field>
                <Field><FieldLabel>Start date</FieldLabel><Input type="date" value={form.start_date ? String(form.start_date).slice(0, 10) : ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
                <Field><FieldLabel>End date</FieldLabel><Input type="date" value={form.end_date ? String(form.end_date).slice(0, 10) : ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="hours" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Working hours range</FieldLabel>
                  <FieldDescription>Daily window, not total duration. Examples: 10:00–18:00.</FieldDescription>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Input type="time" className="w-36" value={form.work_hours_start || ''} onChange={(e) => set('work_hours_start', e.target.value)} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" className="w-36" value={form.work_hours_end || ''} onChange={(e) => set('work_hours_end', e.target.value)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Full-time or part-time</FieldLabel>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={form.engagement_type || ''}
                    onChange={(e) => set('engagement_type', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                  </select>
                </Field>
                {form.engagement_type === 'part_time' ? (
                  <Field>
                    <FieldLabel>Weekly hours</FieldLabel>
                    <Input type="number" min={1} max={40} value={form.weekly_hours || ''} onChange={(e) => set('weekly_hours', e.target.value)} />
                  </Field>
                ) : null}
              </TabsContent>

              <TabsContent value="pay" className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Stipend type</FieldLabel>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={form.stipend_type || ''}
                    onChange={(e) => set('stipend_type', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="fixed">Fixed stipend</option>
                    <option value="incentive">Incentive-based</option>
                  </select>
                </Field>
                {form.stipend_type !== 'incentive' ? (
                  <Field>
                    <FieldLabel>Stipend (INR/mo)</FieldLabel>
                    <Input type="number" value={form.stipend_inr || ''} onChange={(e) => set('stipend_inr', e.target.value)} />
                  </Field>
                ) : (
                  <Field className="sm:col-span-2">
                    <FieldLabel>Incentive basis</FieldLabel>
                    <Textarea rows={3} value={form.incentive_basis || ''} onChange={(e) => set('incentive_basis', e.target.value)} />
                  </Field>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-6"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
