# InternSafar Workbench — Feature Guide (rule-by-rule)

**Source doc:** `InternSafar_Updated_Feature_Refinement_Final_Screening_Disabling_Questions.docx`  
**App:** sibling `internship-portal` only → [http://localhost:3000](http://localhost:3000)  
**Date:** 2026-08-20

### Test logins

| Role | Email | Password |
|---|---|---|
| Candidate | `lawsonlclintern+1@gmail.com` | `Admin@123` |
| Employer | `placementhubsupport@gmail.com` | `Admin@123` |
| SuperAdmin | `support@placementhub.online` | `Admin@123` |

Paths below are browser URLs after login. Replace `{id}` with a real posting or application id.

---

## §3.1 Application-count ranges (`50+` … `2,000+`)

**Rule:** Candidates see approximate volume with `+`; employers see exact / active counts. Historical total includes rejected apps.

| Who | How to see it |
|---|---|
| Candidate | `/candidate/internships` → in the **Match / location** meta row (under company name), text like `50+ applications` — **only if that posting has ≥50 total applications**. Not the `75/100 Employer validation` pill. |
| Candidate | `/candidate/internships/{id}` → same volume text when ≥50 |
| Employer | `/employer/internships` → capacity / applicant counts on posting rows |

---

## Candidate-visible new features (quick list)

| Feature | Path |
|---|---|
| City / work-location multi-select | `/candidate/internships` → Filter Options / city checkboxes |
| Schedule visibility (scheduled/closed hidden) | `/candidate/internships` — only live-window postings listed |
| App volume `50+`… (when enough apps) | Browse card meta + `/candidate/internships/{id}` |
| Employer identity mask | Browse/detail/apps show “Confidential employer” when employer hid identity |
| MCQ screening on apply | `/candidate/internships/{id}` → apply |
| Cap-full apply message | Apply when posting is at 100 active apps |
| Applications workbench + filters | `/candidate/applications` |
| Notification prefs | `/account` |

Most **employer** workbench items (bulk export, lists, Unread/Unresponded, rejection templates, reminders) are **not** on the candidate role.

---

## §3.2 Posting scheduling and visibility

**Rule:** Before `starts_at` → not in candidate browse/detail. After `apply_ends_at` → no apply + hidden from browse. Employer sees Scheduled / Live / Closing soon / Closed (Expired). Optional reminders before launch/close.

| Who | Path |
|---|---|
| Employer create | `/employer/internships/new` → schedule fields + reminder checkboxes |
| Employer edit | `/employer/internships/{id}/edit` → same schedule + reminder toggles |
| Employer list | `/employer/internships` → lifecycle label per posting |
| Candidate | `/candidate/internships` — only live/accessible postings appear |
| Ops (reminders) | With app running: `npm run cron:schedule-reminders` |

---

## §3.3 Employer posting preview

**Rule:** “Preview as candidate” uses candidate presentation rules (identity mask, MCQs, no employer-only data).

| Who | Path |
|---|---|
| Employer | `/employer/internships/new` → **Preview as candidate** |
| Employer | `/employer/internships/{id}/edit` → **Preview as candidate** |

---

## §3.4 MCQ screening (max 5) + response %

**Rule:** Up to 5 MCQs; required/optional; snapshot on apply; employer sees option counts/%.

| Who | Path |
|---|---|
| Employer build | `/employer/internships/new` or `…/{id}/edit` → Screening / MCQ editor |
| Candidate answer | `/candidate/internships/{id}` → apply form |
| Employer summary | `/employer/internships/{id}` → MCQ response summary panel |

---

## §3.5 Applicant workbench (bulk table)

**Rule:** Selection + sticky bulk bar: shortlist, reject, message, lists, export.

| Who | Path |
|---|---|
| Employer | Sidebar **Postings** → `/employer/internships` → open a posting → `/employer/internships/{id}` |

Select rows → bottom toolbar appears.

---

## §3.6 Applicant filters (+ history)

**Rule:** Status / search / match / MCQ filters; internship history (total / completed / ongoing); clear chips; filters persist.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → filter controls above the table |

---

## §3.7 Candidate lists (max 5)

**Rule:** Employer-scoped lists; bulk add; filter by list; delete list ≠ delete candidates.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → bulk **Add to list…** / list filter |

---

## §3.8 Personalized bulk messaging

**Rule:** Employer writes body only; system inserts candidate name per recipient; success/fail + retry.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → select rows → **Message…** |

---

## §3.9 Rejection templates

**Rule:** Default system template + employer CRUD; use on bulk reject.

| Who | Path |
|---|---|
| Employer manager | Sidebar **Rejection templates** → `/employer/rejection-templates` |
| Employer use | `/employer/internships/{id}` → select → **Reject…** → template options |

---

## §3.10 Candidate download / export (CSV + ZIP)

**Rule:** CSV screening data; optional ZIP of resumes; large/ZIP → background job + progress download.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → select applicants → **Export CSV/ZIP** |
| Ops (drain jobs) | `npm run cron:export-jobs` |

---

## §4 Candidate internship history (employer view)

**Rule:** Total / completed / ongoing from applications data; respect `show_completed_internships`. Match score stays separate from validation score.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → history columns / filters on applicant rows |

---

## §5 Application cap — 100 active

**Rule:** Max 100 non-rejected apps per posting; reject frees capacity; historical total still grows.

| Who | Path |
|---|---|
| Employer | `/employer/internships` and `/employer/internships/{id}` → `active/100` style capacity |
| Candidate | Apply on a full posting → clear capacity error |

---

## §6 Candidate email / notification prefs

**Rule:** Retained existing Account notification preferences (not rebuilt).

| Who | Path |
|---|---|
| Candidate | `/account` (notification preferences) |

---

## §7 Employer identity visibility

**Rule:** If hidden → candidates see “Confidential employer” consistently (browse, detail, apps, offers, messages).

| Who | Path |
|---|---|
| Employer set | `/employer/internships/new` or edit → show employer identity toggle |
| Candidate see | `/candidate/internships`, `/candidate/internships/{id}`, `/candidate/applications`, offers/messages |

---

## §8 High-value P1 additions

| Feature | Path |
|---|---|
| Saved views | `/employer/internships/{id}` → save/load filter views |
| Compare (2–4) | Select applicants → compare panel on `/employer/internships/{id}` |
| Notes | Applicant detail / notes on workbench (application notes API) |
| Timeline / events | Application events on workbench |
| Follow-up reminders | Employer reminders on workbench |
| Quality checklist | `/employer/internships/new` → completeness checklist |
| Duplicate title warn | Create/publish when similar title exists |
| Closing summary | API/UI for closed posting → `/api/ip/employer/internships/{id}/closure-summary` (workbench context) |

---

## §14–§17 Candidate application workbench + intelligent filters

**Rule:** Candidate applications as a serious table with status / interview / offer / communication filters; defaults + persistence.

| Who | Path |
|---|---|
| Candidate | Sidebar **My applications** → `/candidate/applications` |

---

## §18 / §25.3 Unread vs Unresponded (employer)

**Rule:** **Unread** ≠ **Unresponded** — independent filters, combinable with other filters.

| Who | Path |
|---|---|
| Employer | `/employer/internships/{id}` → Unread / Unresponded filters |

---

## §25.1 Screening — optional application-disabling answers

**Rule:** Employer marks specific MCQ options as disabling; those applicants are greyed / filterable. **No** auto-disable inferred from question text (e.g. “Are you from IIT?”).

| Who | Path |
|---|---|
| Employer configure | `/employer/internships/new` or edit → MCQ option “disables application” |
| Employer review | `/employer/internships/{id}` → disabled/greyed rows + filter |
| Candidate | Apply form — selecting a disable trigger marks application screening-disabled |

---

## §25.2 Work-location / city filter (browse)

**Rule:** Multi-city searchable filter on candidate browse; separate from MCQ disable logic.

| Who | Path |
|---|---|
| Candidate | `/candidate/internships` → city / work-location multi-select |

---

## §11 / tooling — generate & delete

**Full guide:** [`scripts/IP_TEST_DATA_GUIDE.md`](./scripts/IP_TEST_DATA_GUIDE.md)

```powershell
# Fill the three core accounts (tabs get visible data)
npm run generate:ip-test-data -- --mode=core-fill

# Or create separate +gen accounts
npm run generate:ip-test-data -- --mode=gen-accounts

# Delete one run
npm run delete:ip-generated-run -- --mode=run --confirm-generated-run <RUN_ID>

# Wipe everyone except the three cores
npm run delete:ip-except-cores -- --confirm-except-cores YES
```

---

## §5 testing / QA matrix

```powershell
npm run test:workbench
npm run qa:workbench
# with server up:
npm run qa:workbench:live
```

---

## Quick map (most-used screens)

| Goal | Login as | Go to |
|---|---|---|
| Create posting + schedule + MCQ + reminders + preview | Employer | `/employer/internships/new` |
| Applicant bulk workbench | Employer | `/employer/internships` → `{id}` |
| Rejection templates | Employer | `/employer/rejection-templates` |
| Browse + city filter + volume | Candidate | `/candidate/internships` |
| My applications table | Candidate | `/candidate/applications` |

---

## Not in this build (doc mentioned, out of live IP / deferred)

- Standalone `ip_job_alerts` product productization (prefs retained)
- Full Excel checklist expansion beyond workbench matrix (`qa:checklist` is the larger suite)

For engineering status detail see `WORKBENCH_IMPLEMENTATION_REPORT.md` in this same folder.
