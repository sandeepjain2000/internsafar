# InternSafar Playwright runner playbook

**Product:** InternSafar / Internship Portal (`internship-portal` sibling tree)  
**Not:** Placement Hub (`campus-placement-multiuser`) guided runners / use-case playbooks

This playbook answers the “what is the test runner called?” question and how to run it.

---

## 1. Runner naming

| Name | Path / command | Role |
|---|---|---|
| **InternSafar runner** | `qa/runners/run-internsafar.mjs` | Canonical named entry for IP e2e |
| npm **`qa:e2e`** / **`test:e2e`** | Delegates to the InternSafar runner | Same suite |
| Spec branding | `qa/tests/*.spec.js` | Describe blocks titled `InternSafar …` |

Do **not** refer to:

- Placement Hub `qa/runners/guided/run-guided.mjs`
- PH use-case runners / voice playbooks
- “Campus placement” QA when reporting InternSafar results

---

## 2. Prerequisites

1. Work in the **sibling** app only:

   `C:\Users\place\Work\UIUX Migration\internship-portal`

2. App reachable (local or set `PLAYWRIGHT_BASE_URL` / config baseURL).

3. Core demo accounts seeded (see `qa/helpers/accounts.js` and `scripts/lib/ipCoreSampleConfig.js`).

4. Env present (`.env.local`) — do not blank or overwrite secrets.

---

## 3. Industry tiers (how to run)

From `internship-portal`:

```bash
# Smoke — every change / PR (minutes): auth + Google register UX
npm run qa:e2e:smoke

# Compat alias — old ~47 pack (auth + google + IS-* only); NOT the nightly gate
npm run qa:e2e:smoke-latest

# Regression — on demand / nightly: smoke + IS-* + candidate/employer/SA journeys
# + role screen loads + mobile — then applies Pass/Fail into InternSafar-Test-Cases.xlsx
npm run qa:e2e:regression

# Full Playwright tree only (all qa/tests/*.spec.js)
npm run qa:e2e:full

# Full / release — all Playwright + Excel apply + deep node scripts
# (employer-reg-e2e + register-approve-post-apply). Manual Excel rows still human.
npm run qa:e2e:full:release

# Combined checklist → Excel with --apply
npm run qa:checklist -- --apply
```

| Tier | When | Command | Scope |
|------|------|---------|-------|
| Smoke | Every change / PR | `qa:e2e:smoke` | Login + critical Google/home rules |
| Regression | On demand / nightly | `qa:e2e:regression` | Broader product (journeys + loads) + Excel apply |
| Full / release | Pre-release | `qa:e2e:full:release` | Everything automated + deep scripts; finish Manual Excel |

**Honest coverage:** Automation column on Excel is `Automated` | `Manual` | `Obsolete`. A green regression run updates mapped Automated IDs — **not** the whole workbook.

Suite file lists: `qa/suites.mjs`.

Product hygiene (Obsolete/Edit/Add cases to match live `src/`):

```bash
npm run qa:sync-xlsx-hygiene
npm run qa:audit-xlsx
npm run qa:patch-latest-cases
```

Config: `playwright.config.js` at the app root.

---

## 4. Spec inventory

| Spec | Focus |
|---|---|
| `qa/tests/auth.spec.js` | InternSafar authentication (home login, roles, sign-out) |
| `qa/tests/google-auth.spec.js` | Google register OAuth start + home has no Google login + disabled/unlinked error UX |
| `qa/tests/regression.spec.js` | Latest-update regression smoke (IS-* → Excel) |
| `qa/tests/journeys-candidate.spec.js` | Candidate browse → detail → Report; profile draft; filters |
| `qa/tests/journeys-employer.spec.js` | Employer profile required `*`; Action center; postings list |
| `qa/tests/journeys-superadmin.spec.js` | SA postings + same-status publish skips notify |
| `qa/tests/screens.spec.js` | Role/public **route-load** smoke (breadth, not deep UX) |
| `qa/tests/mobile-candidate-internships.spec.js` | Candidate internships on mobile viewport |

Manual / results workbook:

`test-cases/InternSafar-Test-Cases.xlsx`  
Audit: `reviews/excel-qa-tier-audit-2026-09-24.md`

---

## 5. Applying results

`npm run qa:e2e:regression` and `qa:e2e:full:release` write Playwright JSON then call
`scripts/apply-playwright-regression-xlsx.mjs` → `scripts/apply-internsafar-qa-xlsx.py`.

Obsolete / Manual-only TC-IS ids are not overwritten by automated Blocked/Not Run.

---

## 6. Related docs

- `docs/ai-context/domains/testing.md`
- `docs/qa-employer-register-e2e.md`
