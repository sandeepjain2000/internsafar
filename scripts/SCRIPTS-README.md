# InternSafar — scripts reference

What every file in this folder is for, so nobody has to open one to find out whether it writes
to the database. Deep detail on generating and deleting test data lives in
[`IP_TEST_DATA_GUIDE.md`](./IP_TEST_DATA_GUIDE.md).

**Writes?** column: `no` = read-only, `data` = changes rows, `schema` = changes tables,
`files` = writes local files only.

## Checks and audits (safe to run any time)

| Script | Writes? | What it does |
|---|---|---|
| `check-ip-db-integrity.mjs` | no | Main integrity checker. Fails when offers lack a live application, endorsements have no candidate, pipeline foreign keys dangle, ratings aren't backed by a hired/completed application, or applications point at internships a candidate can't open. Also warns when postings are `published` but not candidate-visible (the empty-Browse trap). |
| `check-ip-db-integrity.cmd` | no | Windows double-click wrapper for the above. |
| `check-ip-candidate-profile-save.mjs` | no | Builds the exact `UPDATE` the candidate profile API builds, for the payload each wizard step posts, and runs it with `AND false` so Postgres type-checks the statement without touching a row. Also asserts no column is assigned twice. Catches "profile won't save" bugs before a user hits them. |
| `audit-core-list-counts.mjs` | no | Counts what the three core accounts see per tab, against the page size of 10, so every list has enough rows to page. |
| `find-seed-labels.mjs` | no | Lists `ip_*` text still containing "seed"/"seeded". No secrets printed. |
| `test-ip-workbench-unit.mjs` | no | Unit tests for workbench helper logic. No database needed. |
| `measure-overflow.mjs` | files | Measures layout overflow in a running app. |
| `shot-candidate-home.mjs` | files | Screenshots the candidate home page. |

## Test data — create, reset, delete

| Script | Writes? | What it does |
|---|---|---|
| `generate-ip-test-data.mjs` | data + schema | Main generator. `--mode=core-fill` fills the three core accounts; `--mode=gen-accounts` creates disposable `+gen` users. Applies pipeline schema idempotently. |
| `delete-ip-generated-run.mjs` | data | Deletes one generate run by id, or everything except the three cores. Requires an explicit confirm flag. |
| `IP_Reset_Core_Sample.js` | data + schema | Nuclear reset to the core baseline: rebuilds the three demo cores plus supporting cast so every major table has content. |
| `seed-ip-completed-for-core.mjs` | data | Gives the core candidate completed applications so "Internships Completed" isn't empty. |
| `fill-ip-posting-requirements.mjs` | data | Backfills `eligibility.requirements_text` and `ideal_profile_text` on published internships missing them. Data only. |
| `sanitize-ip-demo-labels.mjs` | data | Renames visible "seed/seeded" labels so demo rows read like normal data. |
| `assert-db-migrate-allowed.js` | no | **Hard gate.** Refuses migrate/seed unless `IP_ALLOW_DB_MIGRATE=1` (or confirm flag). Path B must never set this. |
| `deploy-fresh-aws-db.mjs` | data + schema | **AWS Path C.** Requires allow. `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` |
| `db_migrate_sql_only_ip.mjs` | schema | SQL 001–039 when demo users exist. `IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only` |
| `db_exec_sql_file.js` | schema | Runs one `.sql` file. Calls the allow gate; fail-closed (`=== OK ===` / `=== FAIL ===` / `=== BLOCKED ===`). |

## Account tools (destructive — read before running)

| Script | Writes? | What it does |
|---|---|---|
| `hard-delete-ip-user.js` | data | Hard-deletes one `ip_*` user with full cascade. See `HARD_DELETE_IP_USER.md`. |
| `hard-delete-internship-local-users.js` | data | Hard-deletes every `*@internship.local` user. Leaves real accounts alone. |
| `set-superadmin-email.js` | data | One-shot: points SuperAdmin at `support@placementhub.online`. |

## QA runners

These drive a running app over HTTP and log in as QA accounts. They can create rows through
normal product flows.

| Script | What it does |
|---|---|
| `run-internsafar-qa.mjs` | **Current suite** — legacy checklist cases plus TC-IS workbook cases. Writes `test-cases/qa-results.json`; `--apply` updates `InternSafar-Test-Cases.xlsx`. |
| `run-ip-checklist-qa.mjs` | Thin alias → `run-internsafar-qa.mjs` (kept for old npm script names). |
| `run-ip-workbench-qa.mjs` | Broader workbench matrix (A5 / P0 rules). |
| `apply-qa-results.mjs` | Merges a results JSON into `qa-results.json` (maps old TC-IP ids via `legacyTcIdMap`) then applies to the workbook. |
| `manual/run-tc-is-06-007-email-change.mjs` | Manual OTP email-change case only (not in the combined suite). |

Legacy `run-sheet10` … `run-sheet25` runners were removed — they targeted the old checklist sheet numbers, not the current InternSafar workbook.

## Background jobs

| Script | Writes? | What it does |
|---|---|---|
| `process-ip-export-jobs.mjs` | data | Drains pending applicant export jobs. |
| `process-ip-schedule-reminders.mjs` | data | Sends pre-launch and pre-close posting reminders. |

## Shared helpers (`scripts/lib/`, not run directly)

`ensureIpPipelineSchema.js` (idempotent pipeline schema), `hardDeleteIpUser.js` (cascade delete
used by the CLI wrappers), `ipCoreBaselinePostings.js` and `ipSeedCoreBaseline.js` (core reset
baseline), `ipCoreSampleConfig.js` (**the only file to edit for core account emails**),
`ipTestDataContent.js` (realistic demo copy for generators), `ipQaAuth.mjs` / `ipQaAuth8.mjs`
(QA login), `ipQaFixtureCases.mjs`, `ipQaRemainingSuite.mjs`, `ipQaRemainingExtras.mjs`
(QA fixtures and cases), `ipQaNaming.mjs` (human-readable QA names — never random blobs),
`legacyTcIdMap.mjs` (old TC ids to checklist ids).

## Workbook and repo utilities

Python: `gen-internsafar-test-cases-xlsx.py` (generate the test-case workbook),
`apply-internsafar-qa-xlsx.py` (apply results into it), `ip_checklist_xlsx.py` and
`xlsx_status_format.py` (checklist sheet building and status formatting).
Node: `create-seed-docs.mjs` (seed document rows).
Git: `git-pull` / `git-push` in `.bat` and `.ps1` — run from the project root regardless of
current directory.
