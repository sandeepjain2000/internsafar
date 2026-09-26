# Domain: Authentication

## Responsibility

Sign-in, registration, sessions, role homes, Google auth helpers, 2FA, account security (password/phone/email change).

## Central sources

| Path | Role |
|------|------|
| `src/lib/auth.js` | NextAuth options |
| `src/lib/apiAuth.js` | API session/role helpers |
| `src/lib/ipEstablishPortalSession.js` | Portal session establishment |
| `src/lib/ipAuthSessions.js` | Auth session tracking |
| `src/lib/ipGoogleAuth.js` | Google identity / verification helpers |
| `src/lib/ipTwoFactor.js` | 2FA |
| `src/app/api/ip/auth/` | Register, password reset, Google intent/verification, 2FA resend, change-password |
| `src/app/api/auth/[...nextauth]/` | NextAuth handler |
| `src/app/api/ip/account/` | Profile, 2FA, sessions, phone-change, password-reset, notification prefs |
| `src/app/page.js`, `login/`, `register/`, `forgot-password/`, `account/` | Public/auth UI |
| `src/app/superadmin/login/` | SuperAdmin login (separate from public `/`) |
| `src/components/ip/PortalShell.jsx` | Client role guard |
| `src/lib/ipNav.js`, `src/lib/roleHome.js` | Nav + role homes |

## Confirmed behaviour

- Roles: `candidate`, `employer`, `superadmin` only.
- No `middleware.js`. **API routes enforce auth.** `PortalShell` is a client-side guard only.
- Google on **register** = verification flow (intent cookie → `?gv=` token); no portal session during signup.
- Google on **home/login is disabled**. Sign-in is **email + password** only (`/?error=GoogleLoginDisabled` if Google OAuth is attempted without a register intent).
- Candidate Google register: verify Gmail → create account → temp password emailed → sign in with email/password; change password in Account; Forgot password at `/forgot-password`.
- Each deploy host needs matching `NEXTAUTH_URL` + Google OAuth redirect URI (still required for **register** verify).

### Employer login / approval (confirmed 2026-09-23+)

| Status | Login | Posting |
|--------|-------|---------|
| Email not verified | Blocked (`EMAIL_NOT_VERIFIED` + resend UI) | Blocked |
| Pending + email verified | **Allowed** (upload docs) | Blocked until Final Approval |
| Approved + email verified | Allowed | Gate: profile + ethics + approved (`ipEmployerPostingGate`) |
| Rejected | Blocked | — |
| Suspended | Blocked | — |

Candidates do **not** require email verify before login. Employer email verify table/columns: `ensureIpEmployerEmailVerifySchema` (schema only — fill blanks via temp runner on AWS, never `email_verify_required=false` grandfather).

## Constraints

- Do not invent OAuth providers, session fields, or role names.
- Preserve Playwright IDs and existing login/register behaviour unless the user asks to change them.
- Never blank `.env.local` auth secrets.
- Process bugs (e.g. docs required for approval but login blocked until approval): surface early; prefer smallest path that restores a workable flow.

## Related domains

Database (user/session/Google tables), Candidate / Employer / SuperAdmin shells, Deployment (env), Testing (Google/2FA policies).

## Inspect before modifying

`auth.js`, the specific API `route.js`, caller page(s), and any Google/2FA helper the change touches.
