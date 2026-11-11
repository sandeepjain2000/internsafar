# InternSafar — security findings verification & remediation plan (2026-11-11)

Status: **Plan only — no fixes applied.** Owner must approve before any code or config change.

This file lives in the InternSafar AI context pack (`docs/ai-context/`), which is this app’s project cortex equivalent until any future rename to `docs/project-cortex/`.

Related evidence (workspace):

- Zip (priority): `Site Testing Placem-20261111T100725Z-1-001.zip`
- Report: `Cybersecurity_Analyst_Candidate_Report_Darshann.docx` (also inside the zip)
- ChatGPT candidate review: context only; if it conflicts with the zip, **zip wins**

Out of scope for this folder: PlacementHub findings (separate plan under PH `docs/project-cortex/09-work/`), Frappe Helpdesk, Part 1 dummy logs, hiring scoring.

**Secrets rule:** do not paste live captcha tokens, session cookies, passwords, or API keys into this document.

**App tree:** edit sibling `internship-portal/` only — never nested `campus-placement-multiuser/internship-portal/`.

---

## 1. Evidence map (zip screenshots ↔ claim)

| Zip file | Host / surface | Maps to |
|----------|----------------|---------|
| `login captcha.png` | Burp on `internship-portal-sigma-mauve.vercel.app` — captcha token Base64 decode | **IS-02** |
| `captcha bypass.png` | Burp — decoded `{a,b,…}`, answer submitted, `{ok:true, gate:…}` | **IS-02** (strongest) |
| `captcha expose bypass.png` | DevTools Sources — client `verifyCaptchaAnswer` → `/api/auth/captcha/verify` | **IS-01 / IS-02** (client path) |
| `captch.png` | Same verify helper in another chunk | **IS-01 / IS-02** |
| `tests.png` | HTTP history of captcha GETs (+ some PH noise) | Supporting traffic only |
| `login api test pll.png` | Candidate dashboard after login (Priya Sharma) | Session context only — not a finding |

Zip does **not** contain screenshots for candidate profile JSON (IS-03), sessions list (IS-04), or help-chat GET AI config (IS-05). Those are **report-only** until re-captured; code still checked below.

---

## 2. Finding-by-finding verification (code + evidence)

### IS-01 — CAPTCHA bypass flag / static token in client JS

| Field | Assessment |
|-------|------------|
| Claimed | `CAPTCHA_BYPASS_FOR_TESTING` / `testing-bypass` present in production JS; bypass attempt failed server-side |
| Zip | Client verify helper visible; no screenshot proving a successful bypass **via** the static token |
| Code | **Present.** `src/lib/captchaBypass.js` exports `CAPTCHA_BYPASS_FOR_TESTING = false` and `STATIC_CAPTCHA_TOKEN = 'testing-bypass'`. Imported by client (`captchaClient.js`, `LoginCaptchaField.jsx`) and server (`simpleCaptcha.js`). With flag **false**, static token should fail signature/nonce checks |
| Verdict | **Confirmed latent hygiene risk (Medium)** — dead bypass strings still ship in the bundle; **not** an active bypass while the flag stays false |
| Report alignment | Zip report correctly downgraded this vs an earlier Critical draft |

**Proposed fix (do not implement yet):**

1. Split bypass helpers so production client bundles never import static bypass tokens (dead-code eliminate via build-time `process.env` that is inlined false, or move bypass-only UI to a dev-only module excluded from prod builds).
2. Keep server `isCaptchaBypassed()` false in all deployed environments; add a deploy checklist / test that production never sets the flag true.
3. Optional: rename/obscurity is worthless — prefer removal over hiding.

---

### IS-02 — CAPTCHA operands embedded in client-issued token

| Field | Assessment |
|-------|------------|
| Claimed | Token Base64 JSON contains `a` and `b`; client can compute sum and pass `/api/auth/captcha/verify` |
| Zip | **Supported.** Decode shows `{a, b, exp, n}`; POST verify with matching sum returns `{ok:true, gate:…}` |
| Code | **Present by design.** `src/lib/simpleCaptcha.js` `createLoginCaptcha()` builds `JSON.stringify({ a, b, exp, n })`, Base64url-encodes it, HMAC-signs with `NEXTAUTH_SECRET`. Client `peekCaptchaOperands` deliberately decodes `a`/`b` for UI lock. Verify checks signature + answer + single-use nonce (`ip_captcha_nonces`) |
| Verdict | **Confirmed weakness of the math-captcha design.** Anyone who can read the token can solve it without “seeing” the image/question. It is **not** forgery of arbitrary tokens without the HMAC secret, and it is **not** password bypass by itself |
| Severity recalibration | Report **Critical** is overstated for “full account takeover.” More accurate: **High for anti-automation** (bots can pass captcha), moderated by existing login throttle (10/email, 50/IP per 15 min — `domains/auth.md`). Still worth fixing if captcha is meant to stop scripting |

**Proposed fix (do not implement yet):**

1. Stop putting solvable operands in the client-visible token body. Options (pick one with owner):
   - Server stores challenge (`a`,`b` or expected answer hash) keyed by opaque nonce only; token carries `{exp,n}` + HMAC; question text comes from a separate authenticated-enough GET that does not include a forgeable answer channel — or simply return `question` from GET while token only has opaque id.
   - Replace math captcha with a provider (Turnstile/hCaptcha) for production.
2. Keep single-use nonce + login throttle; add captcha-endpoint rate limits if missing.
3. Do not treat Base64 alone as security; assume clients are hostile.
4. Re-verify: automated “decode token → POST verify” without using the displayed question should fail after the redesign.

---

### IS-03 — Candidate profile over-exposure / raw S3 key

| Field | Assessment |
|-------|------------|
| Claimed | `GET /api/ip/candidate/profile` returns full PII + raw S3 object key usable outside app controls |
| Zip | **No screenshot** |
| Code | **Authenticated self-profile.** `requireSession(['candidate'])` then `SELECT c.*` plus account fields — returns the candidate’s own row (phone, DOB-related fields if present, links, `resume_url`, etc.). Uploads store `resume_url` as `/api/ip/files?key=<s3-key>` (`src/lib/s3.js`); object fetch is gated by `src/lib/ipFileAccess.js` (own upload / employer linkage / superadmin) |
| Verdict | **Partially confirmed, severity overstated.** Own-profile PII in the profile API is expected for the profile editor. A key inside `/api/ip/files?key=` is **not** a public S3 URL if the bucket stays private; knowing the key without a permitted session should not download the file |
| Residual risk | Confirm no public bucket ACL; ensure no response includes AWS credentials; consider not echoing internal storage keys if UI only needs a download endpoint |

**Proposed fix:**

1. Confirm S3 bucket is private (ops check — no secret values in docs).
2. Optionally return a stable download route without exposing the raw key string in JSON the UI does not need.
3. Do not strip fields the profile editor requires without a product decision.
4. Re-test with authenticated candidate only; never use core accounts for QA (hard constraint 9).

---

### IS-04 — Session history exposes IPs (incl. localhost / node-fetch)

| Field | Assessment |
|-------|------------|
| Claimed | `GET /api/ip/account/sessions` returns many sessions with real IPs; one `::1` + `node-fetch` UA |
| Zip | **No screenshot** |
| Code | **Auth required** (`candidate` / `employer` / `superadmin`). Returns **that user’s** sessions: `id`, `deviceLabel`, `ip`, timestamps, `isCurrent`, `isMobile`. **Does not currently return `userAgent`** in the JSON (report’s `node-fetch` detail may be older code, DB inspection, or mis-label). Limit 50 |
| Verdict | **Confirmed that own-session IPs are returned** (normal for “active sessions” UX). **High severity not justified** for self-visibility. `::1` would only appear if that user’s row was created from localhost against the shared DB (local/Vercel share DB — see `PROJECT_INDEX.md`) — data hygiene issue, not cross-tenant leak |
| Note | Vercel preview and local share the same DB; a localhost session on a preview user’s history is plausible without “prod compromised” |

**Proposed fix:**

1. Keep IP visible only to the session owner; optional mask (e.g. truncate) if product prefers privacy theatre.
2. Purge stale/dev sessions for shared demo users if desired (`revoke` flows already exist).
3. If UA is ever re-added to the API, treat it as sensitive-ish metadata.
4. Do not claim High unless cross-user session enumeration is demonstrated (not seen in code).

---

### IS-05 — AI model / key-configured flag on unauthenticated help-chat GET

| Field | Assessment |
|-------|------------|
| Claimed | Unauthenticated `GET /api/ip/help-chat` returns model name and `envKeyConfigured` |
| Zip | **No screenshot** |
| Code | **Present.** `GET` in `src/app/api/ip/help-chat/route.js` calls `nvidiaCredentialStatus()` and returns `model`, `envKeyConfigured`, `localKeyFiles`, `configured` with **no auth**. POST is rate-limited and does not echo key ids (comment already notes that) |
| Verdict | **Confirmed information disclosure (Low–Medium, not High).** Model name ≠ API key. Still unnecessary public detail |

**Proposed fix:**

1. Require session for GET, or return only `{ ok: true, available: boolean }` with no model/provider/env flags.
2. Keep keys server-only (already).
3. Align any public help widget with the reduced status payload.

---

## 3. Priority order when owner says “fix”

1. **IS-02** — redesign captcha so the answer is not client-derivable from the token  
2. **IS-01** — strip bypass constants from production client bundles  
3. **IS-05** — scrub unauthenticated help-chat status  
4. **IS-03 / IS-04** — confirm impact with fresh screenshots; apply only the residual hardening above  

## 4. Verification checklist (after future fixes)

- Decode captcha token → cannot compute a passing answer without a server-side secret or second channel.
- Production JS search for `testing-bypass` / bypass flag → absent or unreachable.
- Unauthenticated `GET /api/ip/help-chat` → no model name, no env-key booleans (or 401).
- Profile/sessions: still work for the signed-in user; files still require `ipFileAccess` authz.
- Respect testing hold / no dummy accounts / no bounce mail / no core-account abuse (`PROJECT_INDEX.md` hard constraints 9–13).

## 5. Open decisions for owner

- Keep custom math captcha (hardened) vs move to Turnstile/hCaptcha?
- Is Vercel preview’s shared DB with local an accepted risk for session history noise?
- Should help-chat status be login-gated entirely?

## 6. Explicitly not done in this task

No code changes, no env edits, no deploys, no captcha redesign implementation, no AI context zip rebuild wait — pack pointer updates only as needed for discoverability.
