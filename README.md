# Internship Portal

Full stack app (Next.js) for the Internship Portal requirements.

## Key decisions

- Tables: **`ip_*` only** on the shared Supabase Postgres (does not alter `ism_*` or Placement Hub tables).
- Google signup button: credentials registration that still **emails a temporary password** via ZeptoMail (keys from Placement Hub env). Real Google OAuth can replace the button later.
- File uploads (candidate photo, employer logo/docs): AWS S3 via the same `AWS_*` / `S3_BUCKET_NAME` keys as Placement Hub; objects under `internship-portal/…`.
- Skills: `.agents/skills` + `AGENTS.md` mirrored from Placement Hub / [skills.sh](https://www.skills.sh).
- Do not modify `employer-student-internship` until a later merge decision.

## Setup

```bash
cd internship-portal
npm install
npm run db:migrate:ip
npm run dev
```

Open http://localhost:3000

Demo SuperAdmin (ensured via `/api/ip/bootstrap`): `placementhubsupport@gmail.com` / `Admin@123`

Local `@internship.local` demo candidate/employer seeds are **not** recreated by bootstrap.

## Mail / QA inbox (same idea as Placement Hub)

| Env | Effect |
|---|---|
| `OUTBOUND_EMAIL_OVERRIDE=support.placementhub@placementhub.online` | **All** outbound mail (candidate + employer temp-password emails, etc.) is redirected to this Zoho inbox via ZeptoMail/SMTP — mirrors CPMU `OUTBOUND_EMAIL_OVERRIDE`. |
| `IP_MAIL_TEST_FALLBACK` (default `support.placementhub@placementhub.online`) | Used **only** when override is off and delivery to the user’s real address fails. Set `0` / `off` to disable. |

QA / ops inbox: Zoho Mail → `support.placementhub@placementhub.online` (Placement Hub support mailbox).

## Wireframe reference

See `reference-wireframes/` for the previous combined HTML prototype.

## Vercel

Deploy this folder as a Next.js project; set the same env keys as `.env.local` (`DATABASE_URL`, `NEXTAUTH_*`, `ZEPTOMAIL_*`, `SMTP_*`, and optionally `OUTBOUND_EMAIL_OVERRIDE`).
