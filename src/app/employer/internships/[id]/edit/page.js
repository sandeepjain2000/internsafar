'use client';

import { useEffect, useMemo, useState } from 'react';
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
import PostingLocationsFields from '@/components/ip/PostingLocationsFields';
import WorkModeRadios from '@/components/ip/WorkModeRadios';
import useIpCityCatalog from '@/hooks/useIpCityCatalog';
import { internshipDurationMonths } from '@/lib/internshipDurationMonths';
import { normalizeScreeningQuestions } from '@/lib/ipScreeningQuestions';
import '@/components/ip/ip-post-internship.css';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function locationCitiesFromForm(internship) {
  if (Array.isArray(internship?.locations) && internship.locations.length) {
    return internship.locations.map(String);
  }
  if (internship?.location) return [String(internship.location)];
  return [];
}

export default function EditInternshipPage() {
  const { id } = useParams();
  const router = useRouter();
  const { findCity } = useIpCityCatalog();
  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/ip/employer/internships/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const internship = d.internship;
        const cities = locationCitiesFromForm(internship);
        const firstHit = cities[0] ? findCity(cities[0]) : null;
        const locationState =
          firstHit?.state && !/^work mode$/i.test(firstHit.state) ? firstHit.state : '';
        setForm({
          ...internship,
          locationCities: cities,
          locationState,
        });
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

  function setStartDate(value) {
    setForm((f) => {
      const next = { ...f, start_date: value };
      const months = internshipDurationMonths(value, f.end_date ? String(f.end_date).slice(0, 10) : '');
      if (months != null) next.duration_months = String(months);
      return next;
    });
  }

  function setEndDate(value) {
    setForm((f) => {
      const next = { ...f, end_date: value };
      const months = internshipDurationMonths(f.start_date ? String(f.start_date).slice(0, 10) : '', value);
      if (months != null) next.duration_months = String(months);
      return next;
    });
  }

  const startISO = form?.start_date ? String(form.start_date).slice(0, 10) : '';
  const endISO = form?.end_date ? String(form.end_date).slice(0, 10) : '';
  const calculatedDuration = useMemo(
    () => internshipDurationMonths(startISO, endISO),
    [startISO, endISO],
  );
  const durationMismatch =
    calculatedDuration != null
    && form?.duration_months !== ''
    && form?.duration_months != null
    && Number(form.duration_months) !== calculatedDuration;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!String(form.work_mode || '').trim()) {
        throw new Error('Choose a work mode (Remote, Hybrid, or On-site) before saving.');
      }
      if (form.stipend_type !== 'incentive' && form.stipend_inr && form.stipend_inr_max) {
        if (Number(form.stipend_inr_max) < Number(form.stipend_inr)) {
          throw new Error('Stipend maximum must be greater than or equal to the minimum.');
        }
      }
      if (startISO && endISO) {
        const expected = internshipDurationMonths(startISO, endISO);
        if (expected == null) {
          throw new Error('Internship end date must be on or after the start date.');
        }
        if (form.duration_months === '' || form.duration_months == null) {
          setForm((f) => ({ ...f, duration_months: String(expected) }));
        } else if (Number(form.duration_months) !== expected) {
          throw new Error(
            `Duration (${form.duration_months} months) does not match start/end dates (${expected} months). Adjust duration or the dates.`,
          );
        }
      }
      const cities = (form.locationCities || []).length
        ? form.locationCities
        : (form.location ? [form.location] : []);
      const durationMonths =
        form.duration_months !== '' && form.duration_months != null
          ? Number(form.duration_months)
          : calculatedDuration;
      const res = await fetch(`/api/ip/employer/internships/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          location: cities[0] || form.location || '',
          work_mode: form.work_mode,
          stipend_inr: form.stipend_inr ? Number(form.stipend_inr) : null,
          stipend_inr_max: form.stipend_inr_max ? Number(form.stipend_inr_max) : null,
          duration_months: durationMonths != null && !Number.isNaN(durationMonths) ? durationMonths : null,
          start_date: form.start_date,
          end_date: form.end_date,
          starts_at: form.starts_at || null,
          apply_ends_at: form.apply_ends_at || null,
          show_employer_identity: form.show_employer_identity !== false,
          remind_before_start: Boolean(form.remind_before_start),
          remind_before_end: Boolean(form.remind_before_end),
          remind_start_hours: form.remind_start_hours ? Number(form.remind_start_hours) : 24,
          remind_end_hours: form.remind_end_hours ? Number(form.remind_end_hours) : 24,
          locations: cities,
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
    locations: (form.locationCities || []).length
      ? form.locationCities
      : (Array.isArray(form.locations) ? form.locations : (form.location ? [form.location] : [])),
    company_name: form.show_employer_identity !== false ? 'Your company' : 'Confidential employer',
    questions,
    application_volume_label: '50+',
  };

  return (
    <div className="ip-post-internship space-y-4">
      <PageHeader title="Edit posting" description={form.lifecycle_label ? `Lifecycle: ${form.lifecycle_label}` : undefined} />
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Capacity: {form.active_applicant_count ?? '—'}/{form.application_cap ?? 100} active · Historical: {form.applicant_count ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          <form onSubmit={save}>
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {durationMismatch ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Duration does not match dates</AlertTitle>
                <AlertDescription>
                  Duration is {form.duration_months} months but start/end dates span {calculatedDuration} months.
                  Change the duration or the internship dates so they match.
                </AlertDescription>
              </Alert>
            ) : null}
            <Tabs defaultValue="details">
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
                <TabsTrigger value="screening">Screening</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 overflow-visible sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} required /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea rows={4} value={form.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
                <Field className="sm:col-span-2 overflow-visible">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <PostingLocationsFields
                      locationCities={form.locationCities || []}
                      locationState={form.locationState || ''}
                      onStateChange={(state) => set('locationState', state)}
                      onCitiesChange={(next) => {
                        setForm((f) => ({
                          ...f,
                          locationCities: next,
                          location: next[0] || '',
                        }));
                      }}
                    />
                  </div>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Work Mode</FieldLabel>
                  <WorkModeRadios
                    name={`edit-internship-work-mode-${form.id || 'x'}`}
                    value={form.work_mode || ''}
                    onChange={(mode) => set('work_mode', mode)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Duration (months)</FieldLabel>
                  <Input type="number" min={0} value={form.duration_months || ''} onChange={(e) => set('duration_months', e.target.value)} />
                  {durationMismatch ? (
                    <FieldDescription className="text-destructive">
                      Duration does not match start/end dates ({calculatedDuration} months from dates).
                    </FieldDescription>
                  ) : calculatedDuration != null ? (
                    <FieldDescription>Auto-filled from start/end dates when you change them.</FieldDescription>
                  ) : null}
                </Field>
                <Field><FieldLabel>Internship start</FieldLabel><Input type="date" value={startISO} onChange={(e) => setStartDate(e.target.value)} /></Field>
                <Field><FieldLabel>Internship end</FieldLabel><Input type="date" value={endISO} onChange={(e) => setEndDate(e.target.value)} /></Field>
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
                  <>
                    <Field>
                      <FieldLabel>Stipend min (INR/mo)</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={form.stipend_inr || ''}
                        onChange={(e) => set('stipend_inr', e.target.value)}
                        placeholder="e.g. 10000"
                      />
                      <FieldDescription>Fixed amount, or the low end of a range.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Stipend max (INR/mo)</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={form.stipend_inr_max || ''}
                        onChange={(e) => set('stipend_inr_max', e.target.value)}
                        placeholder="Optional — e.g. 15000"
                      />
                      <FieldDescription>Leave blank for a single amount. Candidates see ₹10,000–₹15,000 when both are set.</FieldDescription>
                    </Field>
                  </>
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
