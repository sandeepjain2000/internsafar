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
| `src/app/superadmin/login/` | Redirect-only → `/` (SuperAdmin uses the home form) |
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

### Return to the page after sign-in (confirmed 2026-10-01)

- Logged-out visit to any portal page → `PortalShell` redirects to `/?next=<path+query>` (e.g. shared posting `/candidate/internships/<id>?promo=…`). Home sign-in shows an "Internship link" notice + **Register as a candidate** link for posting paths, and after sign-in opens `next` only if it belongs to the signed-in role's portal (`src/lib/ipReturnTo.js` `returnPathForRole`); otherwise role home.
- `next` is also kept in `localStorage` (`ip_return_to`, 24 h) because candidate registration goes through Google (fixed server return URL) and the temp-password email; `/register/candidate?next=` stores it and its Sign In links carry it back.
- Signed in with the wrong role (e.g. employer opens a candidate posting link) → no redirect; `PortalShell` shows "Sign in as a candidate to view this internship" + Sign out (signs out to `/?next=…`).
- Help coverage: help chatbot entries `internships.shared_link` + `employer.share_posting` (`src/lib/ipHelpChat/knowledge/`) and the `/help` card "Shared internship links". Update them if this flow changes.

### Abuse limits (confirmed 2026-10-03)

- **Captcha is single-use.** Tokens carry a nonce `n`; `/api/auth/captcha/verify` gates carry the same nonce. Login, employer signup and password-reset call `consumeCaptcha` (`src/lib/simpleCaptcha.js`), which spends the nonce in `ip_captcha_nonces` (`src/lib/ipCaptchaNonce.js`, 30 min expiry). Replays → "already used, click New Code". Tokens without a nonce (issued before 2026-10-03) → "out of date". Client refreshes the captcha after every failed submit (`LoginCaptchaField` ref `refresh()`).
- **Login throttle** (`auth.js` `isLoginThrottled`): 10 wrong-password / unknown-account attempts per email, or 50 per IP, in 15 min → blocked with "use Forgot password" (recorded as `Rate limited`). Reads `ip_login_events`; fails open on DB error.
- **2FA:** 5 wrong codes burn a challenge (`ip_2fa_challenges.failed_attempts`); max 5 login codes per user per 15 min (sign-in + resend); resend on a spent challenge asks to sign in again.
- **Password reset:** max 5 reset emails per account per hour; extra requests get the same OK response but no mail.
- Signup (candidate/employer) and employer email-verify run in `transaction()` (`src/lib/transaction.js`); verify token claim is atomic.

### Session / token hardening (confirmed 2026-10-03, Medium audit)

- **2FA resend is browser-bound.** The password step sets an httpOnly cookie `ip_2fa_bind` (15 min) and stores its sha256 in `ip_2fa_challenges.bind_hash` (runtime column via `ensureIpTwoFactorSchema`). `POST /api/ip/auth/2fa/resend` returns 403 unless the cookie matches; successful OTP sign-in deletes the cookie. Challenges opened before this change have no `bind_hash` → 403 "sign in again".
- **Password reset tokens are stored hashed** (`src/lib/ipPasswordResetToken.js`, sha256 hex); the email carries the raw token. Confirm accepts the hash match, or a legacy raw row (stored value not 64 chars). Confirm also burns the user's other open reset tokens and revokes all their `ip_auth_sessions`. QA `run-internsafar-qa.mjs` mints its own hashed row to get a raw token.
- **Revoked session stays revoked:** the `jwt` callback returns early when `token.error` is set (no re-mint).
- **Email change** revokes the user's other sessions (current device stays signed in) instead of deleting rows.
- **Phone change** validates with `validateRequiredPhone`; stores national number + dial code like the profile; verify claim is atomic. Account page shows `+<dial> <national>`.
- **Employer referral** row is created `pending` at signup and credited only on email verification (`consumeEmployerEmailVerification` → `creditReferralForReferredUser`).
- Transactional mail (2FA codes, employer verify, temp password, employer signup ack, ops alerts) passes `skipUnsubscribe: true`; other single-recipient mail is skipped for addresses with a **processed** unsubscribe request (`isEmailUnsubscribed`, fails open).
- User-supplied text in email HTML is escaped with `src/lib/escapeHtml.js`.

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
