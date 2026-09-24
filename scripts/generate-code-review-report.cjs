/**
 * Persist audited review artifacts + generate HTML/MD from skill template shell.
 * Application: internship-portal (InternSafar)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REVIEW = path.join(ROOT, 'reviews', 'internsafar-20260924');
const TEMPLATE = path.join(ROOT, '.agents', 'skills', 'code-review', 'templates', 'report.html');

const findings = [
  {
    id: 'IP-SEC-001',
    title: 'Unauthenticated /api/ip/bootstrap mutates SuperAdmin roles and schema',
    severity: 'Critical',
    category: 'Security',
    area: 'API / Auth',
    file: 'src/app/api/ip/bootstrap/route.js',
    lines: '4-11',
    snippet: 'export async function POST() {\n  const result = await ensureIpBootstrap();\n  return NextResponse.json({ ok: true, ...result });\n}',
    root_cause: 'POST has no requireSession, cron secret, or env gate. ensureIpBootstrap can promote/demote SuperAdmin roles and run schema ensures.',
    impact: 'Any anonymous caller can trigger privileged bootstrap against the shared Neon DB used by local/Vercel.',
    remediation: 'Require SuperAdmin session or IP_ALLOW_BOOTSTRAP=1 / deploy secret; remove public client fire-and-forget calls from sign-in pages.',
    pattern_id: 'AUTHZ-MISSING-GATE',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-002',
    title: 'Employer can open a message thread to any candidate userId (IDOR)',
    severity: 'Critical',
    category: 'Security',
    area: 'API / Messages',
    file: 'src/app/api/ip/messages/threads/route.js',
    lines: '76-120',
    snippet: 'if (!isEmployer) { /* application ownership check */ }\n// employers: no ownership check on otherUserId before INSERT thread',
    root_cause: 'Candidate path validates application+employer; employer path accepts arbitrary otherUserId.',
    impact: 'Employer may create threads to private candidates; combined with file access via thread linkage this can expose resumes.',
    remediation: 'Require owned internship + application (or explicit searchable invite) before employer thread create.',
    pattern_id: 'IDOR-MISSING-OWNERSHIP',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-003',
    title: 'Any shared message thread authorizes candidate resume/photo via files API',
    severity: 'High',
    category: 'Security',
    area: 'API / Files',
    file: 'src/lib/ipFileAccess.js',
    lines: '26-68',
    snippet: 'return employerLinkedToCandidate(uid, id);\n// SELECT 1 FROM ip_message_threads WHERE employer_user_id AND candidate_user_id',
    root_cause: 'canAccessIpObject treats any thread between employer and candidate as enough for candidates/{id} objects.',
    impact: 'Amplifies IP-SEC-002: thread create → resume download without application relationship.',
    remediation: 'Require application ownership (or shortlist) for resume/photo; keep message attachments under messages/{threadId} only.',
    pattern_id: 'AUTHZ-OVERBROAD',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-004',
    title: 'Cron routes fall back to any employer session when IP_CRON_SECRET unset',
    severity: 'High',
    category: 'Security',
    area: 'API / Cron',
    file: 'src/app/api/ip/cron/auto-reject-expired/route.js',
    lines: '22-67',
    snippet: 'if (authz.ok === null) {\n  const { error } = await requireSession([\'employer\', \'superadmin\']);\n}\n// employerId optional → global process',
    root_cause: 'Without cron secret, employer session authorizes global auto-reject / export / reminder drains.',
    impact: 'Cross-tenant mass reject or job processing on shared Neon when secrets are unset.',
    remediation: 'Require IP_CRON_SECRET outside local QA; session fallback SuperAdmin-only or hard-scope to caller employer.',
    pattern_id: 'AUTHZ-TENANT-ESCAPE',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-005',
    title: 'Google OAuth client_secret JSON present in app working tree',
    severity: 'High',
    category: 'Security',
    area: 'Secrets',
    file: 'client_secret_97955918029-….apps.googleusercontent.com.json',
    lines: '1',
    snippet: '{"web":{"client_id":"…apps.googleusercontent.com","client_secret":"[REDACTED]","project_id":"internsafar-oauth"}}',
    root_cause: 'Confidential OAuth client JSON sits on disk (gitignored but present).',
    impact: 'Filesystem/backup/zip access can steal OAuth client secret; accidental commit risk.',
    remediation: 'Delete from tree; rotate secret in Google Cloud; use env vars only.',
    pattern_id: 'SECRETS-IN-TREE',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-006',
    title: 'NVIDIA NIM api_key JSON files present under nvidia_keys/',
    severity: 'High',
    category: 'Security',
    area: 'Secrets',
    file: 'nvidia_keys/key-01.json',
    lines: '1-3',
    snippet: '{ "api_key": "[REDACTED nvapi-…]" }',
    root_cause: 'Local key files loaded by nvidiaLlm for help-chat; gitignored but on disk.',
    impact: 'Credential theft / quota abuse; help-chat GET exposes localKeyFiles count publicly.',
    remediation: 'Remove keys from disk; rotate; env-only on deploy hosts.',
    pattern_id: 'SECRETS-IN-TREE',
    confidence: 'High',
  },
  {
    id: 'IP-CORR-001',
    title: 'Publish charges 50 points before stipend validation / INSERT',
    severity: 'High',
    category: 'Correctness',
    area: 'Business Logic',
    file: 'src/app/api/ip/employer/internships/route.js',
    lines: '76-89',
    snippet: 'chargePublishPoints(...);\nconst stipendParsed = parseStipendRangeFields(body);\nif (stipendParsed.error) return jsonError(...);',
    root_cause: 'Points debit commits in its own transaction before later validation/INSERT.',
    impact: 'Employer can lose 50 points with no posting created.',
    remediation: 'Validate first; charge in same transaction as INSERT; or refund on failure.',
    pattern_id: 'ORPHAN_CHARGE',
    confidence: 'High',
  },
  {
    id: 'IP-CORR-002',
    title: 'Application points debit is not conditional (TOCTOU overdraw)',
    severity: 'High',
    category: 'Correctness',
    area: 'Business Logic',
    file: 'src/app/api/ip/candidate/applications/route.js',
    lines: '160-185',
    snippet: 'SELECT points … if (points < 5) reject;\nUPDATE ip_users SET points = points - $2 WHERE id = $1  // no points >= check',
    root_cause: 'Unlike chargePublishPoints, apply debit does not use WHERE points >= cost inside the lock.',
    impact: 'Concurrent applies can drive balance negative while creating applications.',
    remediation: 'Debit with WHERE points >= $2 RETURNING inside the application transaction.',
    pattern_id: 'TOCTOU_SPEND',
    confidence: 'High',
  },
  {
    id: 'IP-BL-001',
    title: 'Employer publish gate skips ethics / profile_complete',
    severity: 'High',
    category: 'Business Logic',
    area: 'Business Logic',
    file: 'src/lib/ipEmployerPostingGate.js',
    lines: '35-60',
    snippet: 'Checks approval_status + email_verified; does not require ethics_acks or profile_complete.',
    root_cause: 'Gate selects profile_complete but never enforces ethics/completion.',
    impact: 'Approved employers can publish without ethics acknowledgements.',
    remediation: 'Require allEthicsChecked (and optionally profile_complete) before publish/republish.',
    pattern_id: 'GATE_INCOMPLETE',
    confidence: 'High',
  },
  {
    id: 'IP-BL-002',
    title: 'free_post_credits granted at signup but never consumed',
    severity: 'Medium',
    category: 'Business Logic',
    area: 'Business Logic',
    file: 'src/lib/chargePublishPoints.js',
    lines: '9-28',
    snippet: 'Debits points only; free_post_credits never decremented anywhere in src/',
    root_cause: 'Dead dual-currency field still defaulted to 1 on employer register.',
    impact: 'Misleading inventory; signup gift is points-only (50 = one publish).',
    remediation: 'Consume free credit before points, or stop writing/exposing the column.',
    pattern_id: 'DEAD_CURRENCY',
    confidence: 'High',
  },
  {
    id: 'IP-FE-001',
    title: 'Help chatbot “not helpful” reason never POSTed',
    severity: 'Medium',
    category: 'Frontend',
    area: 'Frontend',
    file: 'src/components/ip/HelpChatbot.jsx',
    lines: '140-156',
    snippet: 'if (!msg?.eventId || msg.feedback) return; // second call with reason early-returns',
    root_cause: 'Thumbs-down sets feedback immediately; reason buttons call sendFeedback again and hit the guard.',
    impact: 'Negative feedback reasons discarded; analytics wrong (also related to P2 chatbot UX).',
    remediation: 'Allow reason update after not_helpful, or send reason on first request.',
    pattern_id: 'frontend.dead-user-path',
    confidence: 'High',
  },
  {
    id: 'IP-A11Y-001',
    title: 'Profile Field helpers use orphan <label> (no htmlFor)',
    severity: 'Medium',
    category: 'Accessibility',
    area: 'Frontend',
    file: 'src/app/candidate/profile/page.js',
    lines: '107-125',
    snippet: '<label className="ip-cp-label">{label}</label>\n{children} // siblings, not associated',
    root_cause: 'Caption-only labels; controls are siblings. Same pattern on employer profile Field.',
    impact: 'Screen readers may not associate names with inputs on high-traffic forms.',
    remediation: 'htmlFor/id pairs or wrap controls in label.',
    pattern_id: 'a11y.form-label-association',
    confidence: 'High',
  },
  {
    id: 'IP-A11Y-002',
    title: 'SearchableMultiSelect listbox lacks option roles / keyboard nav',
    severity: 'Medium',
    category: 'Accessibility',
    area: 'Frontend',
    file: 'src/components/ip/SearchableMultiSelect.jsx',
    lines: '122-186',
    snippet: 'role="listbox" … options are plain buttons; Arrow/Escape not implemented',
    root_cause: 'Custom combobox incomplete vs APG.',
    impact: 'Keyboard/SR users cannot operate city/country multi-selects correctly.',
    remediation: 'Implement combobox+listbox pattern or use a compliant component.',
    pattern_id: 'a11y.custom-control-keyboard',
    confidence: 'High',
  },
  {
    id: 'IP-A11Y-003',
    title: 'Modal-like UIs claim dialog without Escape / focus trap',
    severity: 'Medium',
    category: 'Accessibility',
    area: 'Frontend',
    file: 'src/app/candidate/applications/page.js',
    lines: '686-708',
    snippet: 'role="dialog" aria-modal="true" — no Escape handler or focus trap (also HelpChatbot, PortalShell drawer, InternshipCandidatePreview)',
    root_cause: 'Dialog semantics without focus management across multiple overlays.',
    impact: 'Tab can escape to background; Escape does not dismiss.',
    remediation: 'Shared focus-trap + Escape close for all modal overlays.',
    pattern_id: 'a11y.dialog-focus-trap',
    confidence: 'High',
  },
  {
    id: 'IP-TOOL-001',
    title: 'npm run lint fails: no eslint.config.* for ESLint 9',
    severity: 'Medium',
    category: 'Testing',
    area: 'Tooling',
    file: 'package.json',
    lines: '9',
    snippet: '"lint": "eslint" — ESLint 9.39.5: couldn\'t find eslint.config.(js|mjs|cjs)',
    root_cause: 'eslint-config-next present but flat config file missing.',
    impact: 'Lint gate cannot run in CI/local; regressions slip.',
    remediation: 'Add eslint.config.mjs extending next/core-web-vitals.',
    pattern_id: 'TOOLING-LINT-BROKEN',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-007',
    title: 'Unauthenticated /api/ip/ops/report-error can spam ops mail',
    severity: 'Medium',
    category: 'Security',
    area: 'API / Ops',
    file: 'src/app/api/ip/ops/report-error/route.js',
    lines: '21-44',
    snippet: 'POST with no session; invokes reportOpsFailure → email',
    root_cause: 'Public error reporting without auth or strong rate limit.',
    impact: 'Ops inbox / mail quota DoS.',
    remediation: 'Require session or signed token; rate-limit by IP.',
    pattern_id: 'AUTHZ-MISSING-GATE',
    confidence: 'High',
  },
  {
    id: 'IP-SEC-008',
    title: 'Auth-sensitive IDs use Math.random newId',
    severity: 'Low',
    category: 'Security',
    area: 'Crypto',
    file: 'src/lib/ids.js',
    lines: '1-3',
    snippet: '`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`',
    root_cause: 'Non-crypto entropy used for sessions/2FA challenges/etc.',
    impact: 'Weaker unpredictability vs crypto.randomBytes used for password-reset tokens.',
    remediation: 'Use crypto.randomUUID / randomBytes for authz-sensitive ids.',
    pattern_id: 'CRYPTO-WEAK-TOKEN',
    confidence: 'High',
  },
];

const patterns = [
  { id: 'AUTHZ-MISSING-GATE', title: 'Missing authn/authz gate on sensitive routes', finding_ids: ['IP-SEC-001', 'IP-SEC-004', 'IP-SEC-007'] },
  { id: 'IDOR-MISSING-OWNERSHIP', title: 'Insufficient ownership checks on messaging/files', finding_ids: ['IP-SEC-002', 'IP-SEC-003'] },
  { id: 'SECRETS-IN-TREE', title: 'Live credentials on disk (gitignored)', finding_ids: ['IP-SEC-005', 'IP-SEC-006'] },
  { id: 'DEAD_CURRENCY', title: 'Legacy points credits never spent', finding_ids: ['IP-BL-002'] },
  { id: 'a11y.dialog-focus-trap', title: 'Modal overlays without focus trap/Escape', finding_ids: ['IP-A11Y-003'] },
  { id: 'a11y.form-label-association', title: 'Orphan form labels', finding_ids: ['IP-A11Y-001'] },
];

fs.mkdirSync(REVIEW, { recursive: true });

const scopeRaw = fs.readFileSync(path.join(REVIEW, 'scope_manifest.json'), 'utf8').replace(/^\uFEFF/, '');
const scope = JSON.parse(scopeRaw);
const inScopeCount = scope.in_scope_count || (scope.in_scope || []).length;
const reviewedEstimate = 85; // prioritized critical paths + high-traffic UI + libs verified this pass
const deferredCount = Math.max(0, inScopeCount - reviewedEstimate);

const testManifest = {
  commands: [
    { name: 'npm run lint', exit_code: 2, status: 'failed', note: 'ESLint 9: no eslint.config.*' },
    { name: 'npm run test:workbench', exit_code: 0, status: 'passed' },
    { name: 'npm run test:migration-sql-safe', exit_code: 0, status: 'passed' },
    { name: 'npm run test:email-unsubscribe', exit_code: 0, status: 'passed' },
    { name: 'npm run build', exit_code: null, status: 'pending_or_see_build-output.txt', note: 'Captured separately' },
    { name: 'npm run qa:e2e', exit_code: null, status: 'not_run', note: 'Long Playwright suite; not executed in this review pass' },
  ],
};

// Update build status from file if present
const buildOut = path.join(REVIEW, 'build-output.txt');
if (fs.existsSync(buildOut)) {
  const t = fs.readFileSync(buildOut, 'utf8');
  const entry = testManifest.commands.find((c) => c.name === 'npm run build');
  const m = t.match(/BUILD_EXIT=(\d+)/);
  if (m) {
    entry.exit_code = Number(m[1]);
    entry.status = entry.exit_code === 0 ? 'passed' : 'failed';
    entry.note = entry.exit_code === 0 ? 'next build completed' : 'see build-output.txt';
  } else if (/✓ Generating static pages|Route \(app\)/.test(t) && !/Failed to compile/.test(t)) {
    entry.exit_code = 0;
    entry.status = 'passed';
    entry.note = 'next build completed (inferred from log)';
  }
}

const sev = { Critical: 0, High: 0, Medium: 0, Low: 0 };
for (const f of findings) sev[f.severity] = (sev[f.severity] || 0) + 1;

const audited = {
  app: 'internship-portal (InternSafar)',
  review_date: new Date().toISOString(),
  skill: 'DotHrishi/unified-code-review',
  findings,
  patterns,
  severity_counts: sev,
  scores: {
    overall: Math.max(5, 100 - sev.Critical * 18 - sev.High * 8 - sev.Medium * 3 - sev.Low * 1),
    accessibility: Math.max(0, 100 - findings.filter((f) => f.category === 'Accessibility').length * 12),
    security: Math.max(
      5,
      100 - sev.Critical * 25 - findings.filter((f) => f.category === 'Security' && f.severity === 'High').length * 10,
    ),
  },
};

fs.writeFileSync(path.join(REVIEW, 'findings.json'), JSON.stringify(findings, null, 2));
fs.writeFileSync(path.join(REVIEW, 'audited_findings.json'), JSON.stringify(audited, null, 2));
fs.writeFileSync(path.join(REVIEW, 'test_manifest.json'), JSON.stringify(testManifest, null, 2));
fs.writeFileSync(
  path.join(REVIEW, 'deferred.json'),
  JSON.stringify(
    {
      count: deferredCount,
      reason:
        'Complete line-by-line review of all 469 in-scope files was not completed in one pass. Prioritized Security, Authz, Business Logic, high-traffic Frontend/A11y, and tooling. Remaining src/api routes, CSS, scripts, and migrations marked deferred.',
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(REVIEW, 'audit_log.json'),
  JSON.stringify(
    {
      phases: [
        'setup',
        'scope',
        'file_review_prioritized',
        'testing_lint_build',
        'architecture_security',
        'synthesis',
        'consistency_audit',
        'report_generation',
      ],
      verified_finding_count: findings.length,
      invented_evidence: false,
      template_used: TEMPLATE,
      limitations: [
        'SKILL.md upstream truncates after Phase 10 list; followed references + principles.',
        'Not every in-scope file was opened; deferred accounting recorded.',
        'E2E Playwright suite not executed.',
        'Secret values redacted in reports.',
      ],
    },
    null,
    2,
  ),
);

// --- HTML from template CSS shell ---
const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const styleMatch = tpl.match(/<style>[\s\S]*?<\/style>/);
const scriptMatch = tpl.match(/<script>[\s\S]*?<\/script>/);
const style = styleMatch ? styleMatch[0] : '<style></style>';
const script = scriptMatch ? scriptMatch[0] : '';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(sevName) {
  const k = String(sevName).toLowerCase();
  return `<span class="badge badge-${k}">${esc(sevName).toUpperCase()}</span>`;
}

const findingCards = findings
  .map((f) => {
    return `
      <div class="finding-card" id="${esc(f.id)}">
        <div class="finding-header">
          <div class="finding-id-row">
            <strong>${esc(f.id)}</strong>
            ${badge(f.severity)}
            <span class="cat-badge has-findings">${esc(f.category)}</span>
          </div>
          <h3>${esc(f.title)}</h3>
        </div>
        <div class="finding-body">
          <p><strong>File &amp; Location:</strong> <code>${esc(f.file)}:${esc(f.lines)}</code></p>
          <div class="field-block"><div class="field-label">Root cause</div><div class="field-content">${esc(f.root_cause)}</div></div>
          <div class="field-block"><div class="field-label">Impact</div><div class="field-content">${esc(f.impact)}</div></div>
          <div class="field-block"><div class="field-label">Evidence</div><pre class="evidence-code"><code>${esc(f.snippet)}</code></pre></div>
          <div class="field-block"><div class="field-label">Remediation</div><div class="field-content">${esc(f.remediation)}</div></div>
          <p><strong>Pattern:</strong> <code>${esc(f.pattern_id || '—')}</code> · <strong>Confidence:</strong> ${esc(f.confidence)}</p>
        </div>
      </div>`;
  })
  .join('\n');

const summaryRows = findings
  .map(
    (f) => `
            <tr>
              <td><a href="#${esc(f.id)}" style="color: var(--primary); font-weight: 700; text-decoration: none;">${esc(f.id)}</a></td>
              <td>${esc(f.area)}</td>
              <td>${esc(f.category)}</td>
              <td>${badge(f.severity)}</td>
              <td>${esc(f.confidence)}</td>
              <td><code>${esc(f.file)}</code></td>
              <td>${esc(f.lines)}</td>
              <td>${esc(f.title)}</td>
            </tr>`,
  )
  .join('\n');

const testRows = testManifest.commands
  .map(
    (c) => `
        <tr>
          <td><code>${esc(c.name)}</code></td>
          <td>${esc(c.status)}</td>
          <td>${c.exit_code == null ? '—' : esc(c.exit_code)}</td>
          <td>${esc(c.note || '')}</td>
        </tr>`,
  )
  .join('\n');

const patternBlocks = patterns
  .map(
    (p) => `
      <div class="finding-card">
        <h3><code>${esc(p.id)}</code> — ${esc(p.title)}</h3>
        <p>Findings: ${p.finding_ids.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join(', ')}</p>
      </div>`,
  )
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review Report - internship-portal (InternSafar)</title>
  ${style}
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <h1>Code Review Report</h1>
        <div class="header-actions">
          <button type="button" class="theme-toggle-btn" id="themeToggle" aria-label="Toggle theme">Theme</button>
        </div>
      </div>
      <div class="meta-bar">
        <span><strong>Repository:</strong> internship-portal (InternSafar)</span>
        <span><strong>Path:</strong> ${esc(ROOT)}</span>
        <span><strong>Review date:</strong> ${esc(audited.review_date)}</span>
        <span><strong>Skill:</strong> DotHrishi/unified-code-review</span>
      </div>
    </header>

    <nav class="toc" aria-label="Table of contents">
      <div class="toc-grid">
        <a href="#section-executive-summary" class="toc-card"><span class="toc-num">1</span><div class="toc-info"><span class="toc-title">Executive Summary</span><span class="toc-sub">Scores &amp; severity</span></div></a>
        <a href="#section-findings" class="toc-card"><span class="toc-num">2</span><div class="toc-info"><span class="toc-title">Findings</span><span class="toc-sub">${findings.length} verified</span></div></a>
        <a href="#section-patterns" class="toc-card"><span class="toc-num">3</span><div class="toc-info"><span class="toc-title">Systemic Patterns</span><span class="toc-sub">${patterns.length} patterns</span></div></a>
        <a href="#section-findings-summary" class="toc-card"><span class="toc-num">4</span><div class="toc-info"><span class="toc-title">Findings Summary Table</span><span class="toc-sub">Compact scan</span></div></a>
        <a href="#section-verification-evidence" class="toc-card"><span class="toc-num">5</span><div class="toc-info"><span class="toc-title">Verification Evidence</span><span class="toc-sub">Lint / test / build</span></div></a>
        <a href="#section-coverage" class="toc-card"><span class="toc-num">6</span><div class="toc-info"><span class="toc-title">Coverage &amp; Deferred</span><span class="toc-sub">Scope accounting</span></div></a>
      </div>
    </nav>

    <section class="report-section" id="section-executive-summary">
      <div class="section-header"><h2>1. EXECUTIVE SUMMARY</h2></div>
      <div class="exec-stats-grid">
        <div class="stat-card"><div class="stat-val stat-total">${findings.length}</div><div class="stat-label">Total Findings</div></div>
        <div class="stat-card"><div class="stat-val stat-critical">${sev.Critical}</div><div class="stat-label">Critical</div></div>
        <div class="stat-card"><div class="stat-val stat-high">${sev.High}</div><div class="stat-label">High</div></div>
        <div class="stat-card"><div class="stat-val stat-medium">${sev.Medium}</div><div class="stat-label">Medium</div></div>
        <div class="stat-card"><div class="stat-val stat-low">${sev.Low}</div><div class="stat-label">Low</div></div>
      </div>
      <p style="margin-top:1rem;color:var(--text-muted)">
        Overall score (heuristic): <strong>${audited.scores.overall}/100</strong> ·
        Accessibility: <strong>${audited.scores.accessibility}/100</strong> ·
        Security: <strong>${audited.scores.security}/100</strong>
      </p>
      <p style="margin-top:0.75rem;color:var(--text-muted)">
        Highest-risk themes: unauthenticated bootstrap, employer message IDOR + file access,
        cron tenant escape when secrets unset, secrets on disk, points charge/TOCTOU bugs.
        P2 product issues (locations/sessions/message/skills) appear largely implemented in sibling;
        help-chat feedback reason path still broken (IP-FE-001).
      </p>
    </section>

    <section class="report-section" id="section-findings">
      <div class="section-header"><h2>2. FINDINGS (VERIFIED)</h2></div>
      ${findingCards}
    </section>

    <section class="report-section" id="section-patterns">
      <div class="section-header"><h2>3. SYSTEMIC PATTERNS</h2></div>
      ${patternBlocks}
    </section>

    <section class="report-section" id="section-findings-summary">
      <div class="section-header"><h2>4. FINDINGS SUMMARY TABLE</h2></div>
      <table class="findings-summary-table">
        <thead>
          <tr>
            <th>ID</th><th>Area</th><th>Category</th><th>Severity</th><th>Confidence</th><th>File</th><th>Lines</th><th>Title</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
      </table>
    </section>

    <section class="report-section" id="section-verification-evidence">
      <div class="section-header"><h2>5. VERIFICATION EVIDENCE</h2></div>
      <table class="findings-summary-table">
        <thead><tr><th>Command</th><th>Status</th><th>Exit</th><th>Notes</th></tr></thead>
        <tbody>${testRows}</tbody>
      </table>
    </section>

    <section class="report-section" id="section-coverage">
      <div class="section-header"><h2>6. COVERAGE &amp; DEFERRED</h2></div>
      <p>Discovered files (broad walk): ${esc(scope.discovered_total)}. Primary in-scope: ${inScopeCount}.
      Reviewed (prioritized this pass): ~${reviewedEstimate}. Deferred: ~${deferredCount}. Excluded (noise/secrets/docs): ${esc(scope.excluded_count)}.</p>
      <p class="empty-category-notice"><em>Deferred reason:</em> Full line-by-line inspection of every in-scope file was not completed; security/authz/business-critical and high-traffic UI were prioritized. Accounting recorded in deferred.json.</p>
      <p><strong>Limitations:</strong> Upstream SKILL.md truncates after pipeline list; E2E not run; secret values redacted.</p>
    </section>
  </div>
  ${script}
  <script>
    (function(){
      var btn = document.getElementById('themeToggle');
      if (!btn) return;
      btn.addEventListener('click', function(){
        document.body.classList.toggle('light-theme');
      });
    })();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(REVIEW, 'InternSafar-Code-Review-Report.html'), html);

// Markdown
const md = `# internship-portal (InternSafar) — Code Review

**Review Date:** ${audited.review_date}  
**Skill:** DotHrishi/unified-code-review  
**Path:** \`${ROOT}\`

## Verdict

**Overall Score:** ${audited.scores.overall}/100  
**Accessibility Score:** ${audited.scores.accessibility}/100  
**Security Score:** ${audited.scores.security}/100

### Severity

| Severity | Count |
|---|---:|
| Critical | ${sev.Critical} |
| High | ${sev.High} |
| Medium | ${sev.Medium} |
| Low | ${sev.Low} |

## Test & Lint Results

| Command | Status | Exit | Notes |
|---|---|---|---|
${testManifest.commands.map((c) => `| \`${c.name}\` | ${c.status} | ${c.exit_code ?? '—'} | ${c.note || ''} |`).join('\n')}

## Findings

${findings
  .map(
    (f) => `### ${f.id} — ${f.title}
- **Severity:** ${f.severity}
- **Category:** ${f.category}
- **File:** \`${f.file}:${f.lines}\`
- **Pattern:** \`${f.pattern_id || '—'}\`
- **Root cause:** ${f.root_cause}
- **Impact:** ${f.impact}
- **Remediation:** ${f.remediation}

\`\`\`
${f.snippet}
\`\`\`
`,
  )
  .join('\n')}

## Systemic Patterns

${patterns.map((p) => `- **${p.id}**: ${p.title} → ${p.finding_ids.join(', ')}`).join('\n')}

## Deferred / Coverage

- In-scope (primary): ${inScopeCount}
- Reviewed (prioritized): ~${reviewedEstimate}
- Deferred: ~${deferredCount}
- Excluded: ${scope.excluded_count}

## Limitations

- Upstream SKILL.md truncates after Phase 10 heading list; workflow followed via references/principles.
- Not every in-scope file opened line-by-line; deferred.json records this.
- Playwright E2E not executed.
- Secret material redacted; rotate Google/NVIDIA credentials if those files existed on shared machines.
`;

fs.writeFileSync(path.join(REVIEW, 'InternSafar-Code-Review-Report.md'), md);
console.log('Wrote reports to', REVIEW);
console.log('Findings', findings.length, sev);
