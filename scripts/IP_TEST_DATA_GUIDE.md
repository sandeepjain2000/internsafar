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

### B. Create separate gen accounts (`gen-accounts`) — default

Creates brand-new `+gen…` employers/candidates/postings/apps. Does **not** attach that data to the three cores.

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts
```

Optional:

```powershell
npm run generate:ip-test-data -- --mode=gen-accounts --employers=3 --candidates=6 --postings=4
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
| `npm run delete:ip-except-cores -- --confirm-except-cores YES` | Wipe all non-cores |

---

## Safety checklist

- Always dry-run first when unsure
- Never put a core email into a generate run as a new user
- After any delete, confirm you can still login with the three core passwords above
- This guide is separate from the full nuclear `IP_Reset_Core_Sample.js` tool (different, older reset path)
