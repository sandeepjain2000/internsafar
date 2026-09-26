'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CircleHelp, ShieldCheck } from 'lucide-react';
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
import PostingLocationsFields from '@/components/ip/PostingLocationsFields';
import WorkModeRadios from '@/components/ip/WorkModeRadios';
import { internshipDurationMonths } from '@/lib/internshipDurationMonths';
import '@/components/ip/ip-post-internship.css';

const QUALITY_CHECKS = [
  { key: 'title', label: 'Clear Title' },
  { key: 'description', label: 'Description Filled' },
  { key: 'workMode', label: 'Work Mode Chosen' },
  { key: 'location', label: 'Location Or Remote Mode' },
  { key: 'schedule', label: 'Application Window Set', optional: true },
];

const LAST_TAB = 'screening';

export default function NewInternshipPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '', description: '', location: '', locationCities: [], locationState: '', workMode: '', stipendInr: '', stipendInrMax: '', durationMonths: '',
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
  const [degreeOptions, setDegreeOptions] = useState([]);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    fetch('/api/ip/ref/degrees')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Degrees failed to load');
        setDegreeOptions(d.items || []);
      })
      .catch(() => setDegreeOptions([]));
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setStartDate(value) {
    setForm((f) => {
      const next = { ...f, startDate: value };
      const months = internshipDurationMonths(value, f.endDate);
      if (months != null) next.durationMonths = String(months);
      return next;
    });
  }

  function setEndDate(value) {
    setForm((f) => {
      const next = { ...f, endDate: value };
      const months = internshipDurationMonths(f.startDate, value);
      if (months != null) next.durationMonths = String(months);
      return next;
    });
  }

  const calculatedDuration = useMemo(
    () => internshipDurationMonths(form.startDate, form.endDate),
    [form.startDate, form.endDate],
  );

  const durationMismatch =
    calculatedDuration != null
    && form.durationMonths !== ''
    && Number(form.durationMonths) !== calculatedDuration;

  const checklist = {
    title: Boolean(form.title.trim()),
    description: Boolean(form.description.trim()),
    workMode: Boolean(String(form.workMode || '').trim()),
    location: Boolean(form.location.trim()) || /remote/i.test(form.workMode),
    schedule: Boolean(form.startsAt || form.applyEndsAt),
  };

  const doneCount = QUALITY_CHECKS.filter((c) => checklist[c.key]).length;
  const progressPct = Math.round((doneCount / QUALITY_CHECKS.length) * 100);

  async function submit(e, status) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setWarning('');
    try {
      if (!String(form.workMode || '').trim()) {
        throw new Error('Choose a Work Mode (Remote, Hybrid, or On-site) before saving.');
      }
      if (form.stipendType !== 'incentive' && form.stipendInr && form.stipendInrMax) {
        if (Number(form.stipendInrMax) < Number(form.stipendInr)) {
          throw new Error('Stipend maximum must be greater than or equal to the minimum.');
        }
      }
      if (form.startDate && form.endDate) {
        const expected = internshipDurationMonths(form.startDate, form.endDate);
        if (expected == null) {
          throw new Error('Internship end date must be on or after the start date.');
        }
        if (form.durationMonths === '' || form.durationMonths == null) {
          setForm((f) => ({ ...f, durationMonths: String(expected) }));
        } else if (Number(form.durationMonths) !== expected) {
          throw new Error(
            `Duration (${form.durationMonths} months) does not match start/end dates (${expected} months). Adjust duration or the dates.`,
          );
        }
      }
      const durationMonths =
        form.durationMonths !== '' && form.durationMonths != null
          ? Number(form.durationMonths)
          : calculatedDuration;
      const res = await fetch('/api/ip/employer/internships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          stipendInr: form.stipendInr ? Number(form.stipendInr) : null,
          stipendInrMax: form.stipendInrMax ? Number(form.stipendInrMax) : null,
          durationMonths: durationMonths != null && !Number.isNaN(durationMonths) ? durationMonths : null,
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
          eligibility: {
            skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
            degree: (form.degrees || []).join(', ') || form.degree || undefined,
            degrees: form.degrees || [],
            minCgpa: form.minCgpa || undefined,
          },
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
    title: form.title || 'Untitled Internship',
    description: form.description,
    location: form.location,
    locationCities: form.locationCities || [],
    locations: (form.locationCities || []).length
      ? form.locationCities
      : (form.location ? [form.location] : []),
    work_mode: form.workMode,
    stipend_inr: form.stipendInr,
    stipend_inr_max: form.stipendInrMax,
    stipend_type: form.stipendType,
    incentive_basis: form.incentiveBasis,
    duration_months: form.durationMonths,
    engagement_type: form.engagementType,
    weekly_hours: form.weeklyHours,
    work_hours_start: form.workHoursStart,
    work_hours_end: form.workHoursEnd,
    eligibility: {
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    },
    questions: screeningQuestions,
    company_name: form.showEmployerIdentity ? 'Your company' : 'Confidential employer',
    show_employer_identity: form.showEmployerIdentity,
    show_hiring_numbers: true,
    application_volume_label: '50+',
  };

  const onLastTab = activeTab === LAST_TAB;

  return (
    <div className="ip-post-internship flex flex-col gap-4">
      <PageHeader
        title="Post An Internship"
        description="Hours, engagement, and compensation-type fields are optional. Eligibility never blocks applications."
        actions={(
          <>
            <Button type="button" variant="outline" render={<Link href="/employer/internships" />}>
              Back to Postings
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={(e) => submit(e, 'draft')}
            >
              Save Draft
            </Button>
          </>
        )}
      />

      <section className="ip-pq" aria-label="Posting Quality Checklist">
        <div className="ip-pq__inner">
          <div className="ip-pq__top">
            <div className="ip-pq__brand">
              <div className="ip-pq__icon" aria-hidden>
                <ShieldCheck size={18} strokeWidth={2.25} />
              </div>
              <div>
                <p className="ip-pq__eyebrow">Before You Publish</p>
                <h2 className="ip-pq__title">Posting Quality Checklist</h2>
                <p className="ip-pq__desc">
                  A quick review to help applicants understand your opportunity. Nothing here blocks saving your draft.
                </p>
              </div>
            </div>
            <span className="ip-pq__badge">
              <CircleHelp size={14} aria-hidden />
              Guidance Only
            </span>
          </div>

          <ul className="ip-pq__items">
            {QUALITY_CHECKS.map((c) => {
              const done = checklist[c.key];
              return (
                <li key={c.key} className={`ip-pq__item${done ? ' is-done' : ''}`}>
                  <span className="ip-pq__dot" aria-hidden>
                    {done ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                  <span>{c.label}</span>
                  {c.optional ? <span className="ip-pq__opt">Optional</span> : null}
                </li>
              );
            })}
          </ul>

          <div className="ip-pq__progress">
            <div className="ip-pq__bar" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={QUALITY_CHECKS.length}>
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <span className="ip-pq__count">
              {doneCount} Of {QUALITY_CHECKS.length} Complete
            </span>
          </div>
        </div>
      </section>

      <Card className="overflow-visible">
        <CardHeader>
          <p className="ip-post-section-label">Your Content</p>
          <CardTitle className="text-base">Posting Details</CardTitle>
          <CardDescription>Tabbed form to keep the page compact. Publish is available on the last tab.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          <form onSubmit={(e) => {
            if (!onLastTab) {
              e.preventDefault();
              return;
            }
            submit(e, 'published');
          }}
          >
            {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {warning ? <Alert className="mb-4"><AlertTitle>Duplicate Warning</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert> : null}
            {durationMismatch ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Duration Does Not Match Dates</AlertTitle>
                <AlertDescription>
                  Duration is {form.durationMonths} months but start/end dates span {calculatedDuration} months.
                  Change the duration or the internship dates so they match.
                </AlertDescription>
              </Alert>
            ) : null}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="hours">Hours &amp; Engagement</TabsTrigger>
                <TabsTrigger value="pay">Compensation</TabsTrigger>
                <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
                <TabsTrigger value="screening">Screening</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="grid gap-4 overflow-visible sm:grid-cols-2">
                <Field className="sm:col-span-2"><FieldLabel>Title</FieldLabel><Input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
                <Field className="sm:col-span-2 overflow-visible">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <PostingLocationsFields
                      locationCities={form.locationCities || []}
                      locationState={form.locationState || ''}
                      onStateChange={(state) => set('locationState', state)}
                      onCitiesChange={(next) => {
                        set('locationCities', next);
                        set('location', next[0] || '');
                      }}
                    />
                  </div>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Work Mode</FieldLabel>
                  <WorkModeRadios
                    name="new-internship-work-mode"
                    value={form.workMode}
                    onChange={(mode) => set('workMode', mode)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Duration (Months)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={form.durationMonths}
                    onChange={(e) => set('durationMonths', e.target.value)}
                  />
                  {durationMismatch ? (
                    <FieldDescription className="text-destructive">
                      Duration does not match start/end dates ({calculatedDuration} months from dates).
                    </FieldDescription>
                  ) : calculatedDuration != null ? (
                    <FieldDescription>Auto-filled from start/end dates when you change them.</FieldDescription>
                  ) : null}
                </Field>
                <Field><FieldLabel>Internship Start Date</FieldLabel><Input type="date" value={form.startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
                <Field><FieldLabel>Internship End Date</FieldLabel><Input type="date" value={form.endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
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
                  <FieldLabel>Posting Goes Live (Start)</FieldLabel>
                  <Input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Applications Close (End)</FieldLabel>
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
                  <FieldLabel>Working Hours Range (Optional)</FieldLabel>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Input type="time" className="w-36" value={form.workHoursStart} onChange={(e) => set('workHoursStart', e.target.value)} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" className="w-36" value={form.workHoursEnd} onChange={(e) => set('workHoursEnd', e.target.value)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Full-Time Or Part-Time</FieldLabel>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.engagementType} onChange={(e) => set('engagementType', e.target.value)}>
                    <option value="">Not Specified</option>
                    <option value="full_time">Full-Time</option>
                    <option value="part_time">Part-Time</option>
                  </select>
                </Field>
                {form.engagementType === 'part_time' ? (
                  <Field>
                    <FieldLabel>Weekly Hours</FieldLabel>
                    <Input type="number" min={1} max={40} value={form.weeklyHours} onChange={(e) => set('weeklyHours', e.target.value)} />
                  </Field>
                ) : null}
              </TabsContent>

              <TabsContent value="pay" className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Stipend Type</FieldLabel>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.stipendType} onChange={(e) => set('stipendType', e.target.value)}>
                    <option value="">Not Specified</option>
                    <option value="fixed">Fixed Stipend</option>
                    <option value="incentive">Incentive-Based</option>
                  </select>
                </Field>
                {form.stipendType !== 'incentive' ? (
                  <>
                    <Field>
                      <FieldLabel>Stipend Min (INR / Month)</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={form.stipendInr}
                        onChange={(e) => set('stipendInr', e.target.value)}
                        placeholder="e.g. 10000"
                      />
                      <FieldDescription>Fixed amount, or the low end of a range.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Stipend Max (INR / Month)</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={form.stipendInrMax}
                        onChange={(e) => set('stipendInrMax', e.target.value)}
                        placeholder="Optional — e.g. 15000"
                      />
                      <FieldDescription>Leave blank for a single amount. Candidates see ₹10,000–₹15,000 when both are set.</FieldDescription>
                    </Field>
                  </>
                ) : (
                  <Field className="sm:col-span-2">
                    <FieldLabel>Incentive Basis</FieldLabel>
                    <Textarea rows={3} value={form.incentiveBasis} onChange={(e) => set('incentiveBasis', e.target.value)} />
                  </Field>
                )}
              </TabsContent>

              <TabsContent value="eligibility" className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Eligibility: Degree</FieldLabel>
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
                <Field><FieldLabel>Eligibility: Min CGPA</FieldLabel><Input value={form.minCgpa} onChange={(e) => set('minCgpa', e.target.value)} /></Field>
                <Field className="sm:col-span-2"><FieldLabel>Preferred Skills (Comma Separated)</FieldLabel><Input value={form.skills} onChange={(e) => set('skills', e.target.value)} /></Field>
              </TabsContent>

              <TabsContent value="screening" className="grid gap-4">
                <ScreeningQuestionsEditor questions={screeningQuestions} onChange={setScreeningQuestions} />
              </TabsContent>
            </Tabs>

            <div className="ip-post-actions">
              {onLastTab ? (
                <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish Now'}</Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={(e) => submit(e, 'draft')}>Save As Draft</Button>
              <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>Preview As Candidate</Button>
              {!onLastTab ? (
                <Button type="button" onClick={() => {
                  const order = ['details', 'schedule', 'hours', 'pay', 'eligibility', 'screening'];
                  const i = order.indexOf(activeTab);
                  if (i >= 0 && i < order.length - 1) setActiveTab(order[i + 1]);
                }}
                >
                  Next Tab
                </Button>
              ) : null}
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
