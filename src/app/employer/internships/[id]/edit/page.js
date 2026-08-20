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
import ScreeningQuestionsEditor from '@/components/ip/ScreeningQuestionsEditor';
import InternshipCandidatePreview from '@/components/ip/InternshipCandidatePreview';
import { normalizeScreeningQuestions } from '@/lib/ipScreeningQuestions';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditInternshipPage() {
  const { id } = useParams();
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/ip/employer/internships/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setForm(d.internship);
        const qs = Array.isArray(d.internship?.questions) ? d.internship.questions : [];
        const normalized = normalizeScreeningQuestions(qs);
        // Keep legacy text questions readable in editor as MCQ-converted or text
        setQuestions(
          normalized.length
            ? normalized
            : qs.map((q, i) =>
                typeof q === 'string'
                  ? { id: `q${i + 1}`, prompt: q, type: 'text', required: true }
                  : q,
              ),
        );
      });
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
          starts_at: form.starts_at || null,
          apply_ends_at: form.apply_ends_at || null,
          show_employer_identity: form.show_employer_identity !== false,
          remind_before_start: Boolean(form.remind_before_start),
          remind_before_end: Boolean(form.remind_before_end),
          remind_start_hours: form.remind_start_hours ? Number(form.remind_start_hours) : 24,
          remind_end_hours: form.remind_end_hours ? Number(form.remind_end_hours) : 24,
          locations: form.location ? [form.location] : form.locations || [],
          work_hours_start: form.work_hours_start || null,
          work_hours_end: form.work_hours_end || null,
          engagement_type: form.engagement_type || null,
          weekly_hours: form.engagement_type === 'part_time' && form.weekly_hours
            ? Number(form.weekly_hours)
            : null,
          stipend_type: form.stipend_type || null,
          incentive_basis: form.stipend_type === 'incentive' ? (form.incentive_basis || null) : null,
          questions,
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

  const previewInternship = {
    ...form,
    company_name: form.show_employer_identity !== false ? 'Your company' : 'Confidential employer',
    questions,
    application_volume_label: '50+',
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Edit posting" description={form.lifecycle_label ? `Lifecycle: ${form.lifecycle_label}` : undefined} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Capacity: {form.active_applicant_count ?? '—'}/{form.application_cap ?? 100} active · Historical: {form.applicant_count ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save}>
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Tabs defaultValue="details">
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
                <TabsTrigger value="screening">Screening</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} required /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea rows={4} value={form.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
                <Field><FieldLabel>Location</FieldLabel><Input value={form.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
                <Field><FieldLabel>Work mode</FieldLabel><Input value={form.work_mode || ''} onChange={(e) => set('work_mode', e.target.value)} /></Field>
                <Field><FieldLabel>Duration (months)</FieldLabel><Input type="number" value={form.duration_months || ''} onChange={(e) => set('duration_months', e.target.value)} /></Field>
                <Field><FieldLabel>Internship start</FieldLabel><Input type="date" value={form.start_date ? String(form.start_date).slice(0, 10) : ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
                <Field><FieldLabel>Internship end</FieldLabel><Input type="date" value={form.end_date ? String(form.end_date).slice(0, 10) : ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="schedule" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldDescription>Candidate visibility window. End must be after start.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Posting goes live</FieldLabel>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(form.starts_at)}
                    onChange={(e) => set('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Applications close</FieldLabel>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(form.apply_ends_at)}
                    onChange={(e) => set('apply_ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.remind_before_start)}
                      onChange={(e) => set('remind_before_start', e.target.checked)}
                    />
                    Reminder before posting goes live
                  </label>
                  {form.remind_before_start ? (
                    <Input
                      className="mt-2 max-w-[12rem]"
                      type="number"
                      min={1}
                      value={form.remind_start_hours ?? 24}
                      onChange={(e) => set('remind_start_hours', Number(e.target.value))}
                    />
                  ) : null}
                </Field>
                <Field className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.remind_before_end)}
                      onChange={(e) => set('remind_before_end', e.target.checked)}
                    />
                    Reminder before applications close
                  </label>
                  {form.remind_before_end ? (
                    <Input
                      className="mt-2 max-w-[12rem]"
                      type="number"
                      min={1}
                      value={form.remind_end_hours ?? 24}
                      onChange={(e) => set('remind_end_hours', Number(e.target.value))}
                    />
                  ) : null}
                </Field>
              </TabsContent>

              <TabsContent value="hours" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Working hours range</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Input type="time" className="w-36" value={form.work_hours_start || ''} onChange={(e) => set('work_hours_start', e.target.value)} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" className="w-36" value={form.work_hours_end || ''} onChange={(e) => set('work_hours_end', e.target.value)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Full-time or part-time</FieldLabel>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.engagement_type || ''} onChange={(e) => set('engagement_type', e.target.value)}>
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
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.stipend_type || ''} onChange={(e) => set('stipend_type', e.target.value)}>
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

              <TabsContent value="screening">
                <ScreeningQuestionsEditor questions={questions} onChange={setQuestions} />
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>Preview as Candidate</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {previewOpen ? (
        <InternshipCandidatePreview internship={previewInternship} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </div>
  );
}
