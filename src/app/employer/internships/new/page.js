'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import BulletLinesField from '@/components/ip/BulletLinesField';
import { mergeEligibilitySections } from '@/lib/ipPostingBody';

const QUALITY_CHECKS = [
  { key: 'title', label: 'Clear title' },
  { key: 'description', label: 'About This Role filled' },
  { key: 'location', label: 'Location or Remote mode' },
  { key: 'schedule', label: 'Application window set (optional but recommended)' },
];

export default function NewInternshipPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '', description: '', requirementsText: '', idealText: '', location: '', locationCities: [], workMode: 'Remote', stipendInr: '', durationMonths: '',
    startDate: '', endDate: '', skills: '', degree: '', degrees: [], minCgpa: '',
    workHoursStart: '', workHoursEnd: '', engagementType: '', weeklyHours: '',
    stipendType: '', incentiveBasis: '',
    startsAt: '', applyEndsAt: '',
    showEmployerIdentity: true,
    remindBeforeStart: false,
    remindBeforeEnd: false,
    remindStartHours: '24',
    remindEndHours: '24',
  });
  const [screeningQuestions, setScreeningQuestions] = useState([]);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cityOptions, setCityOptions] = useState([]);
  const [degreeOptions, setDegreeOptions] = useState([]);

  useEffect(() => {
    fetch('/api/ip/ref/cities').then((r) => r.json()).then((d) => setCityOptions(d.items || [])).catch(() => {});
    fetch('/api/ip/ref/degrees').then((r) => r.json()).then((d) => setDegreeOptions(d.items || [])).catch(() => {});
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const checklist = {
    title: Boolean(form.title.trim()),
    description: Boolean(form.description.trim()),
    location: Boolean(form.location.trim()) || /remote/i.test(form.workMode),
    schedule: Boolean(form.startsAt || form.applyEndsAt),
  };

  async function submit(e, status) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/ip/employer/internships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          stipendInr: form.stipendInr ? Number(form.stipendInr) : null,
          durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
          weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : null,
          startsAt: form.startsAt || null,
          applyEndsAt: form.applyEndsAt || null,
          showEmployerIdentity: form.showEmployerIdentity,
          remindBeforeStart: form.remindBeforeStart,
          remindBeforeEnd: form.remindBeforeEnd,
          remindStartHours: form.remindStartHours ? Number(form.remindStartHours) : 24,
          remindEndHours: form.remindEndHours ? Number(form.remindEndHours) : 24,
          locations: (form.locationCities || []).length ? form.locationCities : (form.location ? [form.location] : []),
          status,
          eligibility: mergeEligibilitySections({
            skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
            degree: (form.degrees || []).join(', ') || form.degree || undefined,
            degrees: form.degrees || [],
            minCgpa: form.minCgpa || undefined,
          }, { requirements: form.requirementsText, ideal: form.idealText }),
          questions: screeningQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.duplicateWarning) setWarning(data.duplicateWarning.message);
      router.push('/employer/internships');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const previewInternship = {
    title: form.title || 'Untitled internship',
    description: form.description,
    location: form.location,
    work_mode: form.workMode,
    stipend_inr: form.stipendInr,
    stipend_type: form.stipendType,
    incentive_basis: form.incentiveBasis,
    duration_months: form.durationMonths,
    engagement_type: form.engagementType,
    weekly_hours: form.weeklyHours,
    work_hours_start: form.workHoursStart,
    work_hours_end: form.workHoursEnd,
    eligibility: mergeEligibilitySections({
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    }, { requirements: form.requirementsText, ideal: form.idealText }),
    questions: screeningQuestions,
    company_name: form.showEmployerIdentity ? 'Your company' : 'Confidential employer',
    show_employer_identity: form.showEmployerIdentity,
    show_hiring_numbers: true,
    application_volume_label: '50+',
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Post an internship"
        description="Hours, engagement, and compensation-type fields are optional. Eligibility never blocks applications."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posting quality checklist</CardTitle>
          <CardDescription>Recommended before publish — does not block save</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          {QUALITY_CHECKS.map((c) => (
            <span key={c.key} className={checklist[c.key] ? 'text-foreground' : 'text-muted-foreground'}>
              {checklist[c.key] ? '✓' : '○'} {c.label}
            </span>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posting details</CardTitle>
          <CardDescription>Tabbed form to keep the page compact</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => submit(e, 'published')}>
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {warning ? <Alert className="mb-4"><AlertTitle>Duplicate warning</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert> : null}
            <Tabs defaultValue="details">
              <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
                <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
                <TabsTrigger value="screening">Screening</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
                <BulletLinesField
                  label="About This Role"
                  value={form.description}
                  onChange={(v) => set('description', v)}
                  placeholder={'What the intern will do…\n- Own a feature slice\n- Pair with mentors'}
                  hint="Main role story. Use one bullet per line for responsibilities."
                  rows={6}
                />
                <BulletLinesField
                  label="Minimum Requirements"
                  value={form.requirementsText}
                  onChange={(v) => set('requirementsText', v)}
                  placeholder={'Must-have skills or background…\n- Currently enrolled in CS or related\n- Comfortable with Git'}
                />
                <BulletLinesField
                  label="Ideal Candidate Profile"
                  value={form.idealText}
                  onChange={(v) => set('idealText', v)}
                  placeholder={'Nice-to-haves…\n- Built a side project\n- Strong written communication'}
                />
                <Field className="sm:col-span-2">
                  <FieldLabel>Locations (work city)</FieldLabel>
                  <SearchableMultiSelect
                    options={cityOptions}
                    value={form.locationCities || []}
                    onChange={(next) => {
                      set('locationCities', next);
                      set('location', next[0] || '');
                    }}
                    placeholder="Search cities…"
                    ariaLabel="Work cities"
                  />
                </Field>
                <Field><FieldLabel>Work mode</FieldLabel><Input value={form.workMode} onChange={(e) => set('workMode', e.target.value)} placeholder="Remote / Hybrid / On-site" /></Field>
                <Field><FieldLabel>Duration (months)</FieldLabel><Input type="number" value={form.durationMonths} onChange={(e) => set('durationMonths', e.target.value)} /></Field>
                <Field><FieldLabel>Internship start date</FieldLabel><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
                <Field><FieldLabel>Internship end date</FieldLabel><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
                <Field className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.showEmployerIdentity} onChange={(e) => set('showEmployerIdentity', e.target.checked)} />
                    Show company identity to candidates
                  </label>
                </Field>
              </TabsContent>

              <TabsContent value="schedule" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldDescription>
                    Controls when candidates can see and apply. Blank = live immediately on publish.
                    New scheduled starts must be in the future; end must be after start.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Posting goes live (start)</FieldLabel>
                  <Input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Applications close (end)</FieldLabel>
                  <Input type="datetime-local" value={form.applyEndsAt} onChange={(e) => set('applyEndsAt', e.target.value)} />
                </Field>
                <Field className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.remindBeforeStart} onChange={(e) => set('remindBeforeStart', e.target.checked)} />
                    Optional reminder before posting goes live
                  </label>
                  {form.remindBeforeStart ? (
                    <Input className="mt-2 max-w-[12rem]" type="number" min={1} value={form.remindStartHours} onChange={(e) => set('remindStartHours', e.target.value)} />
                  ) : null}
                  <FieldDescription>Hours before start (default 24). Sent once via in-app + email.</FieldDescription>
                </Field>
                <Field className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.remindBeforeEnd} onChange={(e) => set('remindBeforeEnd', e.target.checked)} />
                    Optional reminder before applications close
                  </label>
                  {form.remindBeforeEnd ? (
                    <Input className="mt-2 max-w-[12rem]" type="number" min={1} value={form.remindEndHours} onChange={(e) => set('remindEndHours', e.target.value)} />
                  ) : null}
                </Field>
              </TabsContent>

              <TabsContent value="hours" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Working hours range (optional)</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Input type="time" className="w-36" value={form.workHoursStart} onChange={(e) => set('workHoursStart', e.target.value)} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" className="w-36" value={form.workHoursEnd} onChange={(e) => set('workHoursEnd', e.target.value)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Full-time or part-time</FieldLabel>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.engagementType} onChange={(e) => set('engagementType', e.target.value)}>
                    <option value="">Not specified</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                  </select>
                </Field>
                {form.engagementType === 'part_time' ? (
                  <Field>
                    <FieldLabel>Weekly hours</FieldLabel>
                    <Input type="number" min={1} max={40} value={form.weeklyHours} onChange={(e) => set('weeklyHours', e.target.value)} />
                  </Field>
                ) : null}
              </TabsContent>

              <TabsContent value="pay" className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Stipend type</FieldLabel>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.stipendType} onChange={(e) => set('stipendType', e.target.value)}>
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
                    <Textarea rows={3} value={form.incentiveBasis} onChange={(e) => set('incentiveBasis', e.target.value)} />
                  </Field>
                )}
              </TabsContent>

              <TabsContent value="eligibility" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Eligibility: degree</FieldLabel>
                  <SearchableMultiSelect
                    options={degreeOptions}
                    value={form.degrees || []}
                    onChange={(next) => {
                      set('degrees', next);
                      set('degree', next.join(', '));
                    }}
                    placeholder="Search degrees…"
                    ariaLabel="Eligibility degrees"
                  />
                </Field>
                <Field><FieldLabel>Eligibility: min CGPA</FieldLabel><Input value={form.minCgpa} onChange={(e) => set('minCgpa', e.target.value)} /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Preferred skills (comma separated)</FieldLabel><Input value={form.skills} onChange={(e) => set('skills', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="screening" className="grid gap-4">
                <ScreeningQuestionsEditor questions={screeningQuestions} onChange={setScreeningQuestions} />
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish now'}</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={(e) => submit(e, 'draft')}>Save as draft</Button>
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
