# InternSafar — Generate & Delete Test Data Guide

Repo: sibling `internship-portal` only  
Config source of truth: `scripts/lib/ipCoreSampleConfig.js`

## Core accounts (never delete / never change login identity)

| Role | Email | Password |
|---|---|---|
| Candidate | `lawsonlclintern+1@gmail.com` | `Admin@123` |
| Employer | `shreekar.nyayapathi23+2@vit.edu` | `Admin@123` |
| SuperAdmin | `placementhubsupport@gmail.com` | `Admin@123` |

Generate/delete tooling **must not** change these emails, passwords, or roles.

---

## Prerequisites

```powershell
cd "C:\Users\place\Work\UIUX Migration\internship-portal"
```

- `.env` / `.env.local` has `DATABASE_URL` (or `SUPABASE_DATABASE_URL`)
- Core accounts already exist in the DB (login once / core-sample seed if needed)

---

## 1) Generate — two modes

### A. Fill core accounts (`core-fill`)

Puts visible demo data on the **three core accounts** (postings, applicants, applications, saved, messages, offers, lists, rejection template, notifications, feature ideas, referrals, pending employer for SuperAdmin approvals).

Creates helper `+corefill…` users tagged with a **run ID** (safe to delete later). Does **not** change core passwords.

Default volumes aim for **≥22 rows** on major lists (2 pages at PAGE_SIZE 10): support candidates, employer postings, message threads, notifications, feature ideas, referrals, offers.

**Realism rules (offers / applications / browse):**
- Do **not** reuse the same candidate name on many offer rows.
- Distribute offers across different candidates and employers.
- Unique role titles and companies — no identical “QA Intern” placeholders.
- Cover pending / accepted / declined / expired so filters and tabs have real variety.
- **Browse Internships** only lists *live* published rows (`starts_at` past or null, `apply_ends_at` future or null). Seed scripts must keep most postings live. For “Starting soon” chips, set **`start_date` soon** — never push `starts_at` into the future just for that chip (that hid ~400 rows before).
- Any internship that has **applications / saves / offers / message threads** must stay live after seed (core-fill runs a final repair UPDATE). My Applications → Open internship must never 404 for seeded data.
- **Structured JD (seed):** `description` = About This Role (bullet lines); `eligibility.skills` + `eligibility.requirements_text` + `eligibility.ideal_profile_text` for Match bars and detail sections. No new DB columns — JSON/text only.
- **Profile experience (seed):** `prior_experience` may be a JSON array of `{title, organization, start, end, description}` cards (same field as free text before).

**Candidate advanced filters (UI — no schema change):**
| Screen | Advanced fields |
|---|---|
| Offers | Employer, Stipend, Work Mode/Location, Start Date, Valid Until — **no Status** |
| Applications | Stipend, Work Mode, Location, Applied, **Next** (process dropdown) — **no Status** |
| Notifications | Title, Company, Priority, Deadline — **no When**; Filters + Advanced may both stay open |

**Migrations:** no new SQL migration for this batch (uses existing `eligibility` jsonb + `prior_experience` text).  
**Delete scripts:** unchanged — still cascade by user / run id; no new tables.

```powershell
npm run generate:ip-test-data -- --mode=core-fill
```

Optional:

```powershell
npm run generate:ip-test-data -- --mode=core-fill --support-candidates=22 --support-employers=12 --run-id=corefill_manual1
```

**Then log in and check:**

| Account | Tabs / screens that should show data |
|---|---|
| Candidate | `/candidate/applications`, `/candidate/internships` (Saved), Messages, Offers, Notifications |
| Employer | `/employer/internships` → open a **Core Showcase…** posting (applicants), `/employer/offers`, Rejection templates, Messages, Notifications |
| SuperAdmin | Approvals (pending employer from this run), Notifications |

Copy the printed `runId` if you want to delete only the helper users later.

---

### B. Create separate gen accounts (`gen-accounts`) — default

Creates brand-new `+gen…` employers/candidates/postings/apps. Does **not** attach that data to the three cores.

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts
```

Optional:

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts --employers=22 --candidates=22 --postings=22
```

Save the printed `runId` for deletion.

---

## 2) Delete — two modes

### A. Delete one generate run (`run`)

Removes only users tagged with that `runId` (and their cascaded data). Cores stay.

Dry-run (default):

```powershell
npm run delete:ip-generated-run -- --mode=run --run-id YOUR_RUN_ID
```

Real delete:

```powershell
npm run delete:ip-generated-run -- --mode=run --confirm-generated-run YOUR_RUN_ID
```

---

### B. Delete everyone except the three cores (`except-cores`)

Wipes **all other** `ip_users` (and related data via hard-delete). Keeps only the three core emails. Verifies core id/role/password_hash unchanged after.

Dry-run:

```powershell
npm run delete:ip-except-cores
```

(same as `npm run delete:ip-generated-run -- --mode=except-cores`)

Real wipe:

```powershell
npm run delete:ip-except-cores -- --confirm-except-cores YES
```

**Warning:** This removes cast extras (`+2`, `+3`, …), all gen/corefill helpers, and any other non-core users. Core-owned postings/apps remain.

---

## 3) Database integrity checker (read-only)

```powershell
npm run db:check-integrity
```

Windows double-click / cmd:

```text
C:\Users\place\Work\UIUX Migration\internship-portal\scripts\check-ip-db-integrity.cmd
```

Fails (exit 1) if offers lack a live application, endorsements have no candidate, pipeline FKs dangle, or a rating/endorsement is not backed by a hired/completed application on that internship.

Also reports (and can fail) when many postings are `published` but almost none are **candidate-visible** (scheduled / expired apply window) — the Browse empty trap.

Also fails when **applications point at inaccessible / missing internships**. Informational counts: postings missing `eligibility.requirements_text`, candidates with structured experience JSON.

Also: `npm run db:migrate:pipeline` (023+024) or `npm run db:migrate:workbench` (016–024). Generate/delete/reset apply the same pipeline schema idempotently.

---

## Recommended workflow

```powershell
# 1) Optional clean slate (keep only cores)
npm run delete:ip-except-cores -- --confirm-except-cores YES

# 2) Fill cores so every main tab has something
npm run generate:ip-test-data -- --mode=core-fill

# 3) Optional extra sandbox users
npm run generate:ip-test-data -- --mode=gen-accounts --employers=2 --candidates=4 --postings=2
# … later delete that run only:
npm run delete:ip-generated-run -- --mode=run --confirm-generated-run <RUN_ID>
```

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run generate:ip-test-data -- --mode=core-fill` | Fill cores |
| `npm run generate:ip-test-data -- --mode=gen-accounts` | Create +gen users |
| `npm run delete:ip-generated-run -- --mode=run --confirm-generated-run ID` | Delete one run |
| `npm run db:check-integrity` | Read-only integrity (offers, threads, endorsements, hired/completed ratings) |
| `npm run db:migrate:pipeline` | Apply 023+024 pipeline FKs |
| `npm run db:migrate:workbench` | Apply workbench migrations 016–024 |

---

## Safety checklist

- Always dry-run first when unsure
- Never put a core email into a generate run as a new user
- After any delete, confirm you can still login with the three core passwords above
- This guide is separate from the full nuclear `IP_Reset_Core_Sample.js` tool (different, older reset path)
