# InternSafar — Generate & Delete Test Data Guide

Repo: sibling `internship-portal` only  
Config source of truth: `scripts/lib/ipCoreSampleConfig.js`

## Core accounts (never delete / never change login identity)

| Role | Username | Password |
|---|---|---|
| Candidate | `lawsonlclintern+1@gmail.com` | `Admin@123` |
| Employer | `placementhubsupport@gmail.com` | `Admin@123` |
| SuperAdmin | `support@placementhub.online` | `Admin@123` |

Two gates guard seeded data. Run both after any reset, seed, rename, or QA run:

| Command | Catches |
|---|---|
| `npm run audit:demo-text` | machine text in human-visible copy |
| `npm run audit:demo-consistency` | fields that no longer agree with each other |

The consistency gate exists because renaming a posting title or company leaves
denormalised copy behind — offer `role_title`, thread `subject`, and description
text all quote the posting. It also asserts identity: exactly one SuperAdmin, on
the configured address, and no account that owns an employer profile holding the
superadmin role.

> **Stop the dev server before changing core account emails.** `ensureIpBootstrap`
> promotes whatever account matches its compiled `SUPERADMIN_EMAIL` on boot. When
> the swap moved the Gmail address onto the employer row while `npm run dev` was
> still running the pre-swap constant, bootstrap promoted the core employer to
> SuperAdmin. `audit:demo-consistency` now detects that state.

`audit:demo-text` sweeps every text column of
every `ip_*` table and fails on machine text — a token mixing letters and digits
(`mt140t02xc0e`), a bare epoch (`1786356065134`), or a QA / Gen / Coverage /
fixture word. It exits non-zero, so it can gate a seeding or QA run. This
applies to the QA suites too (`run-internsafar-qa.mjs`, `ipQaFixtureCases.mjs`,
`run-sheets-20-to-16-qa.mjs`): when a generated row needs to be distinguishable
per run, use `ipDemoText.runLabel(run)` for a readable qualifier such as
"Monsoon batch" instead of `Date.now()` or a random id.

All seeded names, titles, and body text come from `scripts/lib/ipDemoText.js` —
real role titles, company names, Indian colleges, and person names, chosen
deterministically by index so repeated runs agree and posting titles stay
unique. Never hard-code scaffolding text like `Coverage role 3`, `Gen Co 0`,
`CoreFill College`, or a random id in a user-visible field; add to the pools in
that module instead.

Seeded rows must only use states the product itself can produce. In particular:
document types come from the four the employer profile offers (no invented
types), suspending an employer changes `ip_employers.approval_status` but leaves
`ip_users.active` true, an approved `ip_employer_requests` row always carries
`created_user_id` plus a real account, and a failed login that records a role
also records `user_id` (`failure_reason` is one of `Unknown account`,
`Inactive account`, `Bad Pass`; `auth_method` is `Password Form` or
`Google OAuth`). Applicant presets are per-internship
(`employer.applicants.<id>`) — never write the bare `employer.applicants` key,
because `ensureIpWorkbenchSchema` fans that out to every posting and fills the
5-preset cap.

Generate/delete tooling **must not** change these emails, passwords, or roles.

Filler **employer** logins are `+aliases` of the core employer address
(`placementhubsupport+3@gmail.com` = the pending-approval employer, Pulse Media)
and filler **candidate** logins are `+aliases` of the core candidate address.
Every seeded employer website is `https://placementhub.online`.

**Why the roles sit on these mailboxes:** Gmail delivers `+alias` mail to the base
inbox natively, Zoho Mail does not — it resolves only addresses that really
exist. The employer and candidate sides need many filler logins, so they live on
Gmail mailboxes where the aliases are genuinely reachable. SuperAdmin is a single
account that never needs an alias, so it holds the Zoho address
`support@placementhub.online`. That address is also `OUTBOUND_EMAIL_OVERRIDE`, so
the SuperAdmin inbox is copied on all outbound mail; `sendMail` detects when the
override is already the intended recipient and sends once rather than twice.

Changing the SuperAdmin address means editing **two** places in step:
`scripts/lib/ipCoreSampleConfig.js` and `src/lib/ensureIpBootstrap.js`. The second
is runtime code that recreates the SuperAdmin on boot, so a mismatch silently
creates a duplicate SuperAdmin account.

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

Puts visible demo data on the **three core accounts** (postings, applicants, applications, saved, messages, offer, lists, rejection template, notifications, pending employer for SuperAdmin approvals).

Creates helper `+corefill…` users tagged with a **run ID** (safe to delete later). Does **not** change core passwords.

```powershell
npm run generate:ip-test-data -- --mode=core-fill
```

Optional:

```powershell
npm run generate:ip-test-data -- --mode=core-fill --support-candidates=8 --run-id=corefill_manual1
```

**Then log in and check:**

| Account | Tabs / screens that should show data |
|---|---|
| Candidate | `/candidate/applications`, `/candidate/internships` (Saved), Messages, Offers, Notifications |
| Employer | `/employer/internships` → open a **Core Showcase…** posting (applicants), Rejection templates, Messages, Notifications |
| SuperAdmin | Approvals (pending employer from this run), Notifications |

Copy the printed `runId` if you want to delete only the helper users later.

---

### A2. Fill employer + SuperAdmin coverage (`fill:core-coverage`)

`core-fill` and the core-sample reset make the candidate-facing lists deep. This
script does the same for the surfaces they do not reach: employer draft / paused /
closed / scheduled / expired postings, completed applications, expired-offer
badges, the recruiter workbench tables (notes, activity, reminders, bulk message
jobs, export jobs, lists, rejection templates, saved views), and the SuperAdmin
queues (rejected / suspended employers, manual requests in all three states,
document review by type and status, LinkedIn promotions, viral shares by status
and channel, candidate form registrations, feature-idea columns, failed logins).

```powershell
npm run fill:core-coverage -- --dry-run   # show the deficit, write nothing
npm run fill:core-coverage                # fill only what is missing
npm run audit:core-coverage               # verify every tab is ≥11 rows
```

Idempotent — it inserts only the shortfall against `--target` (default 11, one row
past a page of 10). Helper accounts it creates are tagged with a
`generated_run_id`, so `delete:ip-generated-run` can remove them; re-run the fill
afterwards. `IP_Reset_Core_Sample.js` runs it automatically at the end of a reset.

---

### B. Create separate gen accounts (`gen-accounts`) — default

Creates brand-new `+gen…` employers/candidates/postings/apps. Does **not** attach that data to the three cores.

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts
```

Optional:

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts --employers=3 --candidates=6 --postings=4
```

Filler addresses default to the mailbox that matches the role — employers off
`EMP_BASE`, candidates off `CAND_BASE`. Override per role if needed:

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts --employer-base-mailbox=placementhubsupport@gmail.com --base-mailbox=lawsonlclintern@gmail.com
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
| `npm run fill:core-coverage` | Fill employer + SuperAdmin tabs/queues (idempotent) |
| `npm run audit:core-coverage` | Check every core tab has ≥11 rows |
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
