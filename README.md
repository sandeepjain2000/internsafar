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

Demo SuperAdmin (ensured via `/api/ip/bootstrap`): `support@placementhub.online` / `Admin@123`

Local `@internship.local` demo candidate/employer seeds are **not** recreated by bootstrap.

## Mail / QA inbox (same idea as Placement Hub)

| Env | Effect |
|---|---|
| `ISM_TEST_ENVIRONMENT=true` (alias `OUTBOUND_EMAIL_OVERRIDE_ENABLED=true`) | **Gate.** Only while this is explicitly true (`true` / `1` / `yes` / `on`) is the override address added. Unset / `false` / `0` / `off` ⇒ every email goes to the real recipient only. |
| `OUTBOUND_EMAIL_OVERRIDE=support.placementhub@placementhub.online` | The support/QA inbox that is **copied on** all outbound mail (candidate + employer temp-password emails, etc.) **when the gate above is on**. The real recipient still receives the email — one send, both addresses. Setting this address alone copies nothing. |
| `IP_MAIL_TEST_FALLBACK` | Failure-only retry target when delivery to the user’s real address fails. Defaults to the support inbox **only while the gate is on**; in production, leave unset and failed sends surface as errors instead of being rerouted. Set `0` / `off` to disable. |

Verify the gate with `npm run test:mail-override` (flag ON → real user **and** support inbox, flag OFF → real user only).

QA / ops inbox: Zoho Mail → `support.placementhub@placementhub.online` (Placement Hub support mailbox).

## Wireframe reference

See `reference-wireframes/` for the previous combined HTML prototype.

## Vercel

Deploy this folder as a Next.js project; set the same env keys as `.env.local` (`DATABASE_URL`, `NEXTAUTH_*`, `ZEPTOMAIL_*`, `SMTP_*`, and optionally `OUTBOUND_EMAIL_OVERRIDE`).
