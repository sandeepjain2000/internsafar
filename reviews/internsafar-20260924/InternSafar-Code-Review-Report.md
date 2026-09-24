# internship-portal (InternSafar) — Code Review

**Review Date:** 2026-09-24T08:58:52.980Z  
**Skill:** DotHrishi/unified-code-review  
**Path:** `C:\Users\place\Work\UIUX Migration\internship-portal`

## Verdict

**Overall Score:** 5/100  
**Accessibility Score:** 64/100  
**Security Score:** 10/100

### Severity

| Severity | Count |
|---|---:|
| Critical | 2 |
| High | 7 |
| Medium | 7 |
| Low | 1 |

## Test & Lint Results

| Command | Status | Exit | Notes |
|---|---|---|---|
| `npm run lint` | failed | 2 | ESLint 9: no eslint.config.* |
| `npm run test:workbench` | passed | 0 |  |
| `npm run test:migration-sql-safe` | passed | 0 |  |
| `npm run test:email-unsubscribe` | passed | 0 |  |
| `npm run build` | pending_or_see_build-output.txt | — | Captured separately |
| `npm run qa:e2e` | not_run | — | Long Playwright suite; not executed in this review pass |

## Findings

### IP-SEC-001 — Unauthenticated /api/ip/bootstrap mutates SuperAdmin roles and schema
- **Severity:** Critical
- **Category:** Security
- **File:** `src/app/api/ip/bootstrap/route.js:4-11`
- **Pattern:** `AUTHZ-MISSING-GATE`
- **Root cause:** POST has no requireSession, cron secret, or env gate. ensureIpBootstrap can promote/demote SuperAdmin roles and run schema ensures.
- **Impact:** Any anonymous caller can trigger privileged bootstrap against the shared Neon DB used by local/Vercel.
- **Remediation:** Require SuperAdmin session or IP_ALLOW_BOOTSTRAP=1 / deploy secret; remove public client fire-and-forget calls from sign-in pages.

```
export async function POST() {
  const result = await ensureIpBootstrap();
  return NextResponse.json({ ok: true, ...result });
}
```

### IP-SEC-002 — Employer can open a message thread to any candidate userId (IDOR)
- **Severity:** Critical
- **Category:** Security
- **File:** `src/app/api/ip/messages/threads/route.js:76-120`
- **Pattern:** `IDOR-MISSING-OWNERSHIP`
- **Root cause:** Candidate path validates application+employer; employer path accepts arbitrary otherUserId.
- **Impact:** Employer may create threads to private candidates; combined with file access via thread linkage this can expose resumes.
- **Remediation:** Require owned internship + application (or explicit searchable invite) before employer thread create.

```
if (!isEmployer) { /* application ownership check */ }
// employers: no ownership check on otherUserId before INSERT thread
```

### IP-SEC-003 — Any shared message thread authorizes candidate resume/photo via files API
- **Severity:** High
- **Category:** Security
- **File:** `src/lib/ipFileAccess.js:26-68`
- **Pattern:** `AUTHZ-OVERBROAD`
- **Root cause:** canAccessIpObject treats any thread between employer and candidate as enough for candidates/{id} objects.
- **Impact:** Amplifies IP-SEC-002: thread create → resume download without application relationship.
- **Remediation:** Require application ownership (or shortlist) for resume/photo; keep message attachments under messages/{threadId} only.

```
return employerLinkedToCandidate(uid, id);
// SELECT 1 FROM ip_message_threads WHERE employer_user_id AND candidate_user_id
```

### IP-SEC-004 — Cron routes fall back to any employer session when IP_CRON_SECRET unset
- **Severity:** High
- **Category:** Security
- **File:** `src/app/api/ip/cron/auto-reject-expired/route.js:22-67`
- **Pattern:** `AUTHZ-TENANT-ESCAPE`
- **Root cause:** Without cron secret, employer session authorizes global auto-reject / export / reminder drains.
- **Impact:** Cross-tenant mass reject or job processing on shared Neon when secrets are unset.
- **Remediation:** Require IP_CRON_SECRET outside local QA; session fallback SuperAdmin-only or hard-scope to caller employer.

```
if (authz.ok === null) {
  const { error } = await requireSession(['employer', 'superadmin']);
}
// employerId optional → global process
```

### IP-SEC-005 — Google OAuth client_secret JSON present in app working tree
- **Severity:** High
- **Category:** Security
- **File:** `client_secret_97955918029-….apps.googleusercontent.com.json:1`
- **Pattern:** `SECRETS-IN-TREE`
- **Root cause:** Confidential OAuth client JSON sits on disk (gitignored but present).
- **Impact:** Filesystem/backup/zip access can steal OAuth client secret; accidental commit risk.
- **Remediation:** Delete from tree; rotate secret in Google Cloud; use env vars only.

```
{"web":{"client_id":"…apps.googleusercontent.com","client_secret":"[REDACTED]","project_id":"internsafar-oauth"}}
```

### IP-SEC-006 — NVIDIA NIM api_key JSON files present under nvidia_keys/
- **Severity:** High
- **Category:** Security
- **File:** `nvidia_keys/key-01.json:1-3`
- **Pattern:** `SECRETS-IN-TREE`
- **Root cause:** Local key files loaded by nvidiaLlm for help-chat; gitignored but on disk.
- **Impact:** Credential theft / quota abuse; help-chat GET exposes localKeyFiles count publicly.
- **Remediation:** Remove keys from disk; rotate; env-only on deploy hosts.

```
{ "api_key": "[REDACTED nvapi-…]" }
```

### IP-CORR-001 — Publish charges 50 points before stipend validation / INSERT
- **Severity:** High
- **Category:** Correctness
- **File:** `src/app/api/ip/employer/internships/route.js:76-89`
- **Pattern:** `ORPHAN_CHARGE`
- **Root cause:** Points debit commits in its own transaction before later validation/INSERT.
- **Impact:** Employer can lose 50 points with no posting created.
- **Remediation:** Validate first; charge in same transaction as INSERT; or refund on failure.

```
chargePublishPoints(...);
const stipendParsed = parseStipendRangeFields(body);
if (stipendParsed.error) return jsonError(...);
```

### IP-CORR-002 — Application points debit is not conditional (TOCTOU overdraw)
- **Severity:** High
- **Category:** Correctness
- **File:** `src/app/api/ip/candidate/applications/route.js:160-185`
- **Pattern:** `TOCTOU_SPEND`
- **Root cause:** Unlike chargePublishPoints, apply debit does not use WHERE points >= cost inside the lock.
- **Impact:** Concurrent applies can drive balance negative while creating applications.
- **Remediation:** Debit with WHERE points >= $2 RETURNING inside the application transaction.

```
SELECT points … if (points < 5) reject;
UPDATE ip_users SET points = points - $2 WHERE id = $1  // no points >= check
```

### IP-BL-001 — Employer publish gate skips ethics / profile_complete
- **Severity:** High
- **Category:** Business Logic
- **File:** `src/lib/ipEmployerPostingGate.js:35-60`
- **Pattern:** `GATE_INCOMPLETE`
- **Root cause:** Gate selects profile_complete but never enforces ethics/completion.
- **Impact:** Approved employers can publish without ethics acknowledgements.
- **Remediation:** Require allEthicsChecked (and optionally profile_complete) before publish/republish.

```
Checks approval_status + email_verified; does not require ethics_acks or profile_complete.
```

### IP-BL-002 — free_post_credits granted at signup but never consumed
- **Severity:** Medium
- **Category:** Business Logic
- **File:** `src/lib/chargePublishPoints.js:9-28`
- **Pattern:** `DEAD_CURRENCY`
- **Root cause:** Dead dual-currency field still defaulted to 1 on employer register.
- **Impact:** Misleading inventory; signup gift is points-only (50 = one publish).
- **Remediation:** Consume free credit before points, or stop writing/exposing the column.

```
Debits points only; free_post_credits never decremented anywhere in src/
```

### IP-FE-001 — Help chatbot “not helpful” reason never POSTed
- **Severity:** Medium
- **Category:** Frontend
- **File:** `src/components/ip/HelpChatbot.jsx:140-156`
- **Pattern:** `frontend.dead-user-path`
- **Root cause:** Thumbs-down sets feedback immediately; reason buttons call sendFeedback again and hit the guard.
- **Impact:** Negative feedback reasons discarded; analytics wrong (also related to P2 chatbot UX).
- **Remediation:** Allow reason update after not_helpful, or send reason on first request.

```
if (!msg?.eventId || msg.feedback) return; // second call with reason early-returns
```

### IP-A11Y-001 — Profile Field helpers use orphan <label> (no htmlFor)
- **Severity:** Medium
- **Category:** Accessibility
- **File:** `src/app/candidate/profile/page.js:107-125`
- **Pattern:** `a11y.form-label-association`
- **Root cause:** Caption-only labels; controls are siblings. Same pattern on employer profile Field.
- **Impact:** Screen readers may not associate names with inputs on high-traffic forms.
- **Remediation:** htmlFor/id pairs or wrap controls in label.

```
<label className="ip-cp-label">{label}</label>
{children} // siblings, not associated
```

### IP-A11Y-002 — SearchableMultiSelect listbox lacks option roles / keyboard nav
- **Severity:** Medium
- **Category:** Accessibility
- **File:** `src/components/ip/SearchableMultiSelect.jsx:122-186`
- **Pattern:** `a11y.custom-control-keyboard`
- **Root cause:** Custom combobox incomplete vs APG.
- **Impact:** Keyboard/SR users cannot operate city/country multi-selects correctly.
- **Remediation:** Implement combobox+listbox pattern or use a compliant component.

```
role="listbox" … options are plain buttons; Arrow/Escape not implemented
```

### IP-A11Y-003 — Modal-like UIs claim dialog without Escape / focus trap
- **Severity:** Medium
- **Category:** Accessibility
- **File:** `src/app/candidate/applications/page.js:686-708`
- **Pattern:** `a11y.dialog-focus-trap`
- **Root cause:** Dialog semantics without focus management across multiple overlays.
- **Impact:** Tab can escape to background; Escape does not dismiss.
- **Remediation:** Shared focus-trap + Escape close for all modal overlays.

```
role="dialog" aria-modal="true" — no Escape handler or focus trap (also HelpChatbot, PortalShell drawer, InternshipCandidatePreview)
```

### IP-TOOL-001 — npm run lint fails: no eslint.config.* for ESLint 9
- **Severity:** Medium
- **Category:** Testing
- **File:** `package.json:9`
- **Pattern:** `TOOLING-LINT-BROKEN`
- **Root cause:** eslint-config-next present but flat config file missing.
- **Impact:** Lint gate cannot run in CI/local; regressions slip.
- **Remediation:** Add eslint.config.mjs extending next/core-web-vitals.

```
"lint": "eslint" — ESLint 9.39.5: couldn't find eslint.config.(js|mjs|cjs)
```

### IP-SEC-007 — Unauthenticated /api/ip/ops/report-error can spam ops mail
- **Severity:** Medium
- **Category:** Security
- **File:** `src/app/api/ip/ops/report-error/route.js:21-44`
- **Pattern:** `AUTHZ-MISSING-GATE`
- **Root cause:** Public error reporting without auth or strong rate limit.
- **Impact:** Ops inbox / mail quota DoS.
- **Remediation:** Require session or signed token; rate-limit by IP.

```
POST with no session; invokes reportOpsFailure → email
```

### IP-SEC-008 — Auth-sensitive IDs use Math.random newId
- **Severity:** Low
- **Category:** Security
- **File:** `src/lib/ids.js:1-3`
- **Pattern:** `CRYPTO-WEAK-TOKEN`
- **Root cause:** Non-crypto entropy used for sessions/2FA challenges/etc.
- **Impact:** Weaker unpredictability vs crypto.randomBytes used for password-reset tokens.
- **Remediation:** Use crypto.randomUUID / randomBytes for authz-sensitive ids.

```
`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
```


## Systemic Patterns

- **AUTHZ-MISSING-GATE**: Missing authn/authz gate on sensitive routes → IP-SEC-001, IP-SEC-004, IP-SEC-007
- **IDOR-MISSING-OWNERSHIP**: Insufficient ownership checks on messaging/files → IP-SEC-002, IP-SEC-003
- **SECRETS-IN-TREE**: Live credentials on disk (gitignored) → IP-SEC-005, IP-SEC-006
- **DEAD_CURRENCY**: Legacy points credits never spent → IP-BL-002
- **a11y.dialog-focus-trap**: Modal overlays without focus trap/Escape → IP-A11Y-003
- **a11y.form-label-association**: Orphan form labels → IP-A11Y-001

## Deferred / Coverage

- In-scope (primary): 469
- Reviewed (prioritized): ~85
- Deferred: ~384
- Excluded: 162

## Limitations

- Upstream SKILL.md truncates after Phase 10 heading list; workflow followed via references/principles.
- Not every in-scope file opened line-by-line; deferred.json records this.
- Playwright E2E not executed.
- Secret material redacted; rotate Google/NVIDIA credentials if those files existed on shared machines.
