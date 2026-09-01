# AWS deploy — InternSafar (Internship Portal)

## Authoritative runbook

Full EC2, RDS, DNS, Nginx, HTTPS, and PM2 steps:

**`InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1).docx`**

(workspace root: `C:\Users\place\Work\UIUX Migration\`)

This handoff bundle lives in **`internship-portal-aws-handoff/`** (workspace root):

| Item | Location |
|------|----------|
| Project zip | `internship-portal-aws-deploy-*.zip` |
| Migration SQL copies | `migrations/` |
| Standalone runner | `runner/` (`node db_migrate_all_ip.mjs`) |
| Docs | `README.txt`, this file, `DB-REFERENCE.md`, `SETUP-NOTES.txt` |

Our docs **supplement** the runbook (zip + full migration command). They do **not** replace runbook console steps.

## Architecture (from runbook)

| Layer | Choice |
|-------|--------|
| Public path | Domain → **Elastic IP** → **EC2 Ubuntu 24.04** → **Nginx 80/443** → **Next.js :3000** (localhost only) |
| Process | **PM2** — `pm2 start npm --name internsafar -- start` |
| Node | **22** |
| App directory | `~/internship-portal` |
| Database | **Private RDS PostgreSQL** — database `internsafar`, port **5432**, EC2 security group → RDS security group only |
| Region (source) | **ap-south-1** (Mumbai) |
| **Do NOT use** | Amplify, Kubernetes, load balancer, public port 3000, public RDS 5432 |

## Where this zip fits in the runbook

| Runbook step | Action |
|--------------|--------|
| Parts A–B | Create EC2, Elastic IP, private RDS |
| Steps 18–20 | Upload/extract deploy zip → `~/internship-portal` |
| Step 21 | Create `.env` on EC2 (RDS URL + secrets) |
| Step 22 | RDS connection test |
| **Step 23 override** | **`npm run db:migrate:all`** (all 38 IP migrations) — **not** partial `db:migrate` / 001-only |
| Steps 24–26 | `npm run build` → PM2 `internsafar` |
| Parts F–G | Nginx, domain, Certbot, `pm2 startup` |

## EC2 `.env` example

Create on EC2 only — **never upload** local `.env` / `.env.local`.

```env
DATABASE_URL=postgresql://<RDS_USER>:<RDS_PASSWORD>@<RDS_ENDPOINT>:5432/internsafar
NODE_ENV=production
NEXTAUTH_URL=https://<DOMAIN>
NEXTAUTH_SECRET=<secret>
# Mail, S3, etc. — copy from secure channel (Vercel dashboard or ops)
ZEPTOMAIL_API_KEY=<...>
AWS_REGION=<...>
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
S3_BUCKET_NAME=<...>
# If RDS SSL errors (runbook Step 41):
DATABASE_SSL_CA=/etc/ssl/rds/global-bundle.pem
```

URL-encode special characters in the RDS password inside `DATABASE_URL`.

## RDS connection test (before migrate)

Runbook Step 22:

```bash
cd ~/internship-portal
node -e "require('dotenv').config(); const {Client}=require('pg'); const c=new Client({connectionString:process.env.DATABASE_URL}); c.connect().then(()=>{console.log('RDS CONNECTION SUCCESS'); return c.end()}).catch(e=>{console.error(e); process.exit(1)})"
```

## Deploy sequence (after runbook Parts A–B)

```bash
cd ~/internship-portal
npm install --legacy-peer-deps
npm run db:migrate:all
npm run db:check-integrity
npm run build
pm2 start npm --name internsafar -- start
pm2 save
# Then Nginx + Certbot — runbook Parts F–G
```

## Upload zip to EC2

From your PC (example):

```bash
scp -i /path/to/internsafar-prod-key.pem internship-portal-aws-deploy-*.zip ubuntu@<ELASTIC_IP>:~/
ssh -i /path/to/internsafar-prod-key.pem ubuntu@<ELASTIC_IP>
unzip internship-portal-aws-deploy-*.zip
# ensures ~/internship-portal/ ...
```

Runbook Step 18 uses `tar.gz`; this zip is equivalent when extracted to `~/internship-portal`.

## Safety rules

- Normal deployment **does not recreate or wipe** the database.
- Do **not** rerun migrations on EC2/RDS reboot alone.
- InternSafar is isolated from Placement Hub — use InternSafar EC2/RDS/`ip_*` only.
- Do **not** run destructive `recreate.mjs` unless runbook conditional schema-fix section applies.

## Cron (post-deploy)

Vercel cron is not used on AWS. Schedule on EC2 if needed:

- `npm run cron:schedule-reminders`
- `npm run cron:export-jobs`
