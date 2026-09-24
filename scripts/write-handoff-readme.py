#!/usr/bin/env python3
"""Write README.txt for internship-portal-aws-handoff with complete file tree."""
from pathlib import Path
import sys

HANDOFF = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\place\Work\UIUX Migration\internship-portal-aws-handoff")


def tree_lines(root: Path) -> list[str]:
    lines = [f"{root.name}/"]
    entries = sorted(root.iterdir(), key=lambda p: (p.is_file() is False, p.name.lower()))
    files = [p for p in entries if p.is_file()]
    dirs = [p for p in entries if p.is_dir()]

    for i, p in enumerate(files):
        last = i == len(files) - 1 and not dirs
        branch = "└── " if last else "├── "
        lines.append(f"{branch}{p.name}")

    for di, d in enumerate(dirs):
        last_dir = di == len(dirs) - 1
        prefix = "└── " if last_dir else "├── "
        lines.append(f"{prefix}{d.name}/")
        kids = sorted(d.iterdir(), key=lambda p: p.name.lower())
        for ki, k in enumerate(kids):
            last_k = ki == len(kids) - 1
            mid = "    " if last_dir else "│   "
            kbranch = "└── " if last_k else "├── "
            lines.append(f"{mid}{kbranch}{k.name}")
    return lines


def build_readme(handoff: Path) -> str:
    all_files = sorted(
        p.relative_to(handoff).as_posix() for p in handoff.rglob("*") if p.is_file()
    )
    mig = [f for f in all_files if f.startswith("migrations/")]
    runner = [f for f in all_files if f.startswith("runner/")]
    structure = "\n".join(tree_lines(handoff))
    inventory = "\n".join(f"  {f}" for f in all_files)

    return f"""InternSafar — AWS handoff bundle (README)
========================================

Share this folder as internship-portal-aws-handoff.zip together with the runbook:
  InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx

What this bundle is
-------------------
One SCP-ready folder for EC2. App source is a Linux-safe .tar.gz (not a .zip).
Migrations and a standalone runner are included beside the tar.

How to use (short)
------------------
Path B (live EC2, RDS unchanged) — full pastable blocks:
  → AWS-DEPLOY.md  (section "Path B — full pastable")
  → Runbook docx Part M
  → Do NOT run any database migrate/seed on Path B

Path C (fresh/empty RDS):
  → From extracted app: IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db
  → (001–034 → core demo seed → 035–044)
  → Without IP_ALLOW_DB_MIGRATE=1 the command is BLOCKED in code (exit 1)

SQL only when demo users already exist:
  → IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only
  → Or handoff: IP_ALLOW_DB_MIGRATE=1 … node runner/db_migrate_sql_only_ip.mjs

Why Path B must not migrate / how code stops it:
  → PATH-B-NO-DB-MIGRATE.txt

Migration success check:
  Every SQL file must print === OK: … applied successfully ===
  If you see === FAIL: … === or === BLOCKED: … === the run FAILED (exit 1) — do not continue.

CAPTCHA (real challenge — this pack)
------------------------------------
This build has CAPTCHA_BYPASS_FOR_TESTING = false (src/lib/captchaBypass.js).
Real numbered Security Verification; “New Code” rotates the challenge.

Required in EC2 .env (signing uses the same secret as NextAuth):
  NEXTAUTH_URL=https://internsafar.com
  NEXTAUTH_SECRET=<openssl rand -base64 32>

Confirm after deploy:
  curl -i http://127.0.0.1:3000/api/auth/captcha  → must be HTTP 200

Emergency only: set CAPTCHA_BYPASS_FOR_TESTING = true and Path B redeploy.
Prefer fixing NEXTAUTH_SECRET instead.

QA on EC2 (Linux) vs local/Vercel
---------------------------------
Same Playwright specs as Vercel/local, but run the AWS entry so defaults fit production Linux:
  cd ~/internship-portal
  npm run playwright:install
  npm run qa:e2e:aws:smoke      # auth + Google UX
  npm run qa:e2e:aws            # regression (journeys + screens + mobile)

AWS runner defaults (override with env if needed):
  IP_BASE=https://internsafar.com
  PW_NO_WEBSERVER=1             # PM2 already serves — do not spawn npm run dev
  PW_USE_BUNDLED_CHROMIUM=1     # no system Google Chrome on EC2
  IP_QA_SKIP_OPS_PROBES=1       # do not fire ops-alert email probes on live

Do NOT run qa:e2e:full:release / employer-reg deep scripts against live RDS
unless you intentionally want new users on production.

Core accounts: qa/helpers/accounts.js must exist on AWS RDS.
If cores use login OTP, set IP_QA_2FA_* in ~/internship-portal/.env (never commit).

Details: qa/docs/AWS-QA-NOTES.txt (inside the app tar).

Cursor agents: read AGENTS.md (inside the app tar) “AWS / RDS database scripts” before any migrate.
App tar folder map: APP-FOLDER-STRUCTURE.txt (inside tar) or APP-TAR-FOLDER-STRUCTURE.txt (this folder).

Required .env on EC2 (NEW credentials — provided separately, NOT in this zip)
-----------------------------------------------------------------------------
This zip never contains .env, client_secret JSON, or real secrets.

The handoff person will give you NEW production values separately (outside the zip).
Do NOT reuse old EC2 .env values or a laptop .env.local — old/wrong env caused:
  - sign-out / Google OAuth redirecting to localhost:3000 (bad NEXTAUTH_URL)
  - login / CAPTCHA failures (missing NEXTAUTH_SECRET)
  - broken Google verification (stale client id/secret)

Put these into ~/internship-portal/.env using the NEW values you were given:
  NEXTAUTH_URL=https://internsafar.com
  NEXTAUTH_SECRET=<new secret — or: openssl rand -base64 32>
  DATABASE_URL=<RDS — keep unless you were given a new one>
  GOOGLE_CLIENT_ID=<from separately provided Google OAuth credentials>
  GOOGLE_CLIENT_SECRET=<from separately provided Google OAuth credentials>

If you received a Google client secret JSON file separately: copy client_id and
client_secret into .env only. Do not leave that JSON in the handoff folder or Git.

After any .env change: npm run build THEN pm2 restart internsafar --update-env

See also runbook docx Part O (credentials) and Part R (DB + CAPTCHA).

Issues fixed by this pack: ISSUES-FIXED.txt
Path B no-DB write-up:     PATH-B-NO-DB-MIGRATE.txt
DB script index:           DB-SCRIPTS-REFERENCE.txt
Short checklist:           SETUP-NOTES.txt
Full deploy notes:         AWS-DEPLOY.md
DB notes:                  DB-REFERENCE.md
App tar folders:           APP-TAR-FOLDER-STRUCTURE.txt  (same text as APP-FOLDER-STRUCTURE.txt in tar)

Complete folder structure (every file in this handoff)
------------------------------------------------------
{structure}

File inventory (every path — {len(all_files)} files)
-------------------------------------------------------
{inventory}

Notes
-----
- App code lives inside internship-portal-aws-deploy-*.tar.gz (extract to ~/internship-portal-new).
- After extract, open APP-FOLDER-STRUCTURE.txt for the app’s appropriate folder map (not every source file).
- migrations/: {len(mig)} SQL files (001–044; two files named 008_*). Path B still must not migrate.
- runner/: {len(runner)} files — use db_migrate_sql_only_ip.mjs only when demo users already exist.
- Path B: no DB migrate (code gate: assert-db-migrate-allowed.js / PATH-B-NO-DB-MIGRATE.txt).
- Path C: IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db.
- Fail-closed: === OK === / === FAIL === / === BLOCKED ===.
- CAPTCHA: real challenge (bypass OFF). NEXTAUTH_SECRET required for captcha API.
- QA on EC2: npm run qa:e2e:aws (not the Windows Chrome + webServer local defaults).
"""


def main():
    if not HANDOFF.is_dir():
        raise SystemExit(f"Missing handoff folder: {HANDOFF}")

    readme_path = HANDOFF / "README.txt"
    if readme_path.exists():
        readme_path.unlink()
    readme_path.write_text(build_readme(HANDOFF), encoding="utf-8", newline="\n")
    count = sum(1 for p in HANDOFF.rglob("*") if p.is_file())
    print(f"Wrote {readme_path} ({count} files listed)")


if __name__ == "__main__":
    main()
