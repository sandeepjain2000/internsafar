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

## 3. How to run

From `internship-portal`:

```bash
# Preferred (named InternSafar runner)
npm run qa:e2e

# Equivalent
npm run test:e2e
node qa/runners/run-internsafar.mjs

# Single file / headed
node qa/runners/run-internsafar.mjs qa/tests/auth.spec.js
node qa/runners/run-internsafar.mjs --headed
```

The runner is a thin wrapper: it spawns `npx playwright test` with any extra args forwarded.

Config: `playwright.config.js` at the app root.

---

## 4. Spec inventory

| Spec | Focus |
|---|---|
| `qa/tests/auth.spec.js` | InternSafar authentication (home login, roles, sign-out) |
| `qa/tests/screens.spec.js` | Role screen smoke after login |
| `qa/tests/mobile-candidate-internships.spec.js` | Candidate internships on mobile viewport |

Helpers:

| Helper | Purpose |
|---|---|
| `qa/helpers/accounts.js` | Core candidate / employer / superadmin emails + password |
| `qa/helpers/login.js` | Sign-in / captcha / sign-out helpers |
| `qa/routes-by-role.js` | Route expectations by role |

---

## 5. Demo accounts (core sample)

Password for core accounts: see `qa/helpers/accounts.js` (`password` field).

| Role | Home after login |
|---|---|
| Candidate | `/candidate` |
| Employer | `/employer` |
| Superadmin | `/superadmin` |

Emails are the core-sample Gmail/+cast addresses in `accounts.js` — keep them in sync with seed/reset scripts.

---

## 6. Manual smoke (optional, no Playwright)

When you only need a quick browser check after deploy:

1. Open production or local home.
2. Sign in as candidate → Profile / Browse / Applications / Offers / Messages / Notifications / Ideas.
3. Sign in as employer → Profile / Candidates / Internships / Offers / Messages.
4. Confirm status labels show **Offered** / **Action Required** (never raw `offered` / `action_required`).

Candidate-facing batch checklist: `task-docs/InternSafar_Change_Batch_Showcase.md` (workspace root `task-docs/`).

---

## 7. Reporting

When filing results, title them:

- **InternSafar e2e** — pass/fail by spec  
- Runner: `qa/runners/run-internsafar.mjs` (or `npm run qa:e2e`)

Do not mix with Placement Hub guided-runner reports.
