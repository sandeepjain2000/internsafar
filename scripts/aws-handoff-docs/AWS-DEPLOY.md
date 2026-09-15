# AWS deploy — InternSafar (Internship Portal)

## Authoritative runbook

Full EC2, RDS, DNS, Nginx, HTTPS, and PM2 steps:

**`InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx`**

This handoff bundle lives in **`internship-portal-aws-handoff/`** (workspace root):

| Item | Location |
|------|----------|
| Project archive | `internship-portal-aws-deploy-*.tar.gz` (tar only — no zip) |
| App folder map | `APP-TAR-FOLDER-STRUCTURE.txt` (same as `APP-FOLDER-STRUCTURE.txt` inside the tar) |
| Migration SQL copies | `migrations/` |
| Standalone runner | `runner/db_migrate_sql_only_ip.mjs` |
| Docs | `README.txt`, this file, `DB-REFERENCE.md`, `SETUP-NOTES.txt`, `ISSUES-FIXED.txt` |

## Three deployment paths

| Path | When | Database command |
|------|------|------------------|
| **A — First-time AWS** | New EC2 + RDS | Runbook Parts A–K |
| **B — App update** | New code, RDS unchanged | Extract tar → chmod → app-swap → build → PM2 (**no DB migrate**; do **not** set `IP_ALLOW_DB_MIGRATE`) |
| **C — Fresh RDS** | **Genuinely empty** database only | **`IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db`** — never use to wipe live/prod data |

### Live data rule

Going forward, migrations must keep existing data intact.
They cannot be delete-and-insert or truncate-and-insert refresh/replace workflows.
Prefer additive schema and in-place / idempotent updates.
Do not treat Path C or “sql-only” as permission to wipe an existing production database.
Laptop/Vercel migrate refuses AWS RDS hostnames (accident guard); Path C on EC2 is unchanged.

### Which DB script?

| Situation | Command |
|-----------|---------|
| Path B — app code update | **Do not run DB migrate/seed.** Do not set `IP_ALLOW_DB_MIGRATE`. |
| Existing / live RDS — schema change | Only when explicitly requested; **data-preserving** SQL only (inspect first). |
| Path C — fresh / empty RDS | **`IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db`** (**empty RDS only**; run on EC2) |
| SQL only; demo users already exist | **`IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only`** (review SQL; not auto-safe for live prod) |

**Why / how stopped in code:** see `PATH-B-NO-DB-MIGRATE.txt` (gate: `scripts/assert-db-migrate-allowed.js`). Without the allow env/flag, migrate prints `=== BLOCKED ===` and exits 1.

## CAPTCHA

This pack ships with `CAPTCHA_BYPASS_FOR_TESTING = false` in `src/lib/captchaBypass.js`
(real numbered Security Verification; “New Code” rotates the challenge).

**Required on EC2** (captcha signing uses the same secret as NextAuth):

```env
NEXTAUTH_URL=https://internsafar.com
NEXTAUTH_SECRET=<strong random — openssl rand -base64 32>
```

Confirm captcha API after deploy:

`curl -i http://127.0.0.1:3000/api/auth/captcha`

Optional QA-only fixed `3 + 4`: set `DUMMY_CAPTCHA=true` in env (not for production).

Then: `npm run build` && `pm2 restart internsafar --update-env`

**Emergency bypass only:** set `CAPTCHA_BYPASS_FOR_TESTING = true` in `src/lib/captchaBypass.js` and Path B redeploy — login works without solving the math, but prefer fixing `NEXTAUTH_SECRET` instead.

## Migration fail-closed (read the banners)

- `=== OK: … applied successfully (exit 0) ===` — that file succeeded
- `=== FAIL: migration did NOT apply successfully ===` — **stop**; exit code is **1**

Do not continue past FAIL. Success only if process **exits 0** and every file showed OK.

## Extract + permissions (Step 18b)

```bash
cd ~/internship-portal-aws-handoff
mkdir -p ~/internship-portal-new
tar -xzf internship-portal-aws-deploy-*.tar.gz -C ~/internship-portal-new
chmod -R u+rwX ~/internship-portal-new
chown -R ubuntu:ubuntu ~/internship-portal-new
tar -tzf internship-portal-aws-deploy-*.tar.gz | head   # verify listing
```

Then run the app-swap block (preserve live `.env`):

```bash
set -e
cp ~/internship-portal/.env ~/internship-portal.env.backup
mv ~/internship-portal ~/internship-portal-old-$(date +%Y%m%d)
mv ~/internship-portal-new/internship-portal ~/internship-portal
cp ~/internship-portal.env.backup ~/internship-portal/.env
chmod 600 ~/internship-portal/.env
cd ~/internship-portal
grep -E '^(DATABASE_|NEXTAUTH_|GOOGLE_)' .env
```

## EC2 `.env` (required for auth)

**NEW credentials are provided separately — not inside this zip.**  
Do **not** reuse old EC2 `.env` or laptop `.env.local` (old/wrong `NEXTAUTH_URL` / missing `NEXTAUTH_SECRET` / stale Google keys caused localhost redirects and login failures).

```env
DATABASE_URL=postgresql://<RDS_USER>:<RDS_PASSWORD>@<RDS_ENDPOINT>:5432/internsafar
NODE_ENV=production
NEXTAUTH_URL=https://internsafar.com
NEXTAUTH_SECRET=<new secret from handoff person — or openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from separately provided Google OAuth credentials>
GOOGLE_CLIENT_SECRET=<from separately provided Google OAuth credentials>
```

If you were given a Google client secret JSON file **outside** the zip: copy `client_id` / `client_secret` into `.env` only — do not leave the JSON on the server handoff folder or in Git.

After changing `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, or Google keys: **`npm run build`** then **`pm2 restart internsafar --update-env`**.

Google Cloud Console redirect URI must match: `https://internsafar.com/api/auth/callback/google`

See runbook **Part O**.

## Fresh RDS (Path C)

```bash
cd ~/internship-portal
npm install --legacy-peer-deps
IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db
```

Without `IP_ALLOW_DB_MIGRATE=1` the command is **blocked in code** (`=== BLOCKED ===`, exit 1). See `PATH-B-NO-DB-MIGRATE.txt`.

This runs: migrations 001–034 → core demo seed → migrations 035–039.

Demo accounts (password `Admin@123`):

- Candidate: `lawsonlclintern+1@gmail.com`
- Employer: `placementhubsupport@gmail.com`
- SuperAdmin: `support@placementhub.online`

## Path B — full pastable (app update, RDS unchanged)

Do **not** run `deploy:fresh-aws-db` unless intentionally resetting data.

### Block 1 — extract + permissions

```bash
cd ~/internship-portal-aws-handoff
mkdir -p ~/internship-portal-new
tar -xzf internship-portal-aws-deploy-*.tar.gz -C ~/internship-portal-new
chmod -R u+rwX ~/internship-portal-new
chown -R ubuntu:ubuntu ~/internship-portal-new
tar -tzf internship-portal-aws-deploy-*.tar.gz | head
ls ~/internship-portal-new/internship-portal/package.json
```

### Block 2 — app-swap (preserve .env)

```bash
set -e
cp ~/internship-portal/.env ~/internship-portal.env.backup
mv ~/internship-portal ~/internship-portal-old-$(date +%Y%m%d)
mv ~/internship-portal-new/internship-portal ~/internship-portal
cp ~/internship-portal.env.backup ~/internship-portal/.env
chmod 600 ~/internship-portal/.env
cd ~/internship-portal
grep -E '^(DATABASE_|NEXTAUTH_|GOOGLE_)' .env
```

### Block 3 — install, build, PM2

```bash
cd ~/internship-portal
npm install --legacy-peer-deps
npm run build
pm2 restart internsafar --update-env
pm2 status
curl -sI https://internsafar.com | head
```

## Standalone handoff runner

```bash
cp ~/internship-portal/.env ~/internship-portal-aws-handoff/.env
cd ~/internship-portal-aws-handoff/runner
NODE_PATH=~/internship-portal/node_modules node db_migrate_sql_only_ip.mjs
```

Fresh RDS: use `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` from the extracted app instead.

## Safety rules

- Normal deployment **does not recreate or wipe** the database.
- `recreate.mjs` in `~/internsafar-aws` is **Part I emergency only** (missing tables).
- PM2 log line `Server Reference ID did not match` — usually stale build; OK if HTTP 200 and UI works.
