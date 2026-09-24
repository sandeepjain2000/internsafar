/**
 * Assembles the self-contained code-review report prompt
 * (skeleton + exact CSS/JS appendices). No report.html required.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const style = fs
  .readFileSync(path.join(ROOT, '.agents/skills/code-review/templates/shell-style.html'), 'utf8')
  .trim();
const script = fs
  .readFileSync(path.join(ROOT, '.agents/skills/code-review/templates/shell-script.html'), 'utf8')
  .trim();

const head = `# InternSafar / unified code-review report (self-contained prompt)

**This prompt alone is enough.** You do **not** need \`report.html\`, any sample HTML, or other external files to produce a report identical in format to the v2 shell.

If \`scripts/generate-code-review-report-v2.cjs\` + shell files exist in the repo, prefer running the generator for speed. If they do not exist, **write the HTML yourself** using:
1. The **HTML skeleton** (class names + section order) below
2. The **exact CSS** in Appendix A (paste into \`<head>\`)
3. The **exact theme JS** in Appendix B (paste before \`</body>\`)
4. Your audited findings as dynamic fill

Never invent a different layout or CSS theme.

---

## Mode

Unified code review of InternSafar (sibling \`internship-portal/\` only). Do not start remediations unless the user asks after the report.

## Non-negotiable rules

1. Output one **self-contained** \`.html\` file (CSS + JS inline from Appendix A/B).
2. Use **exactly** the class names and section \`id\`s in the skeleton.
3. Fill only dynamic text/counts/findings/evidence — do not redesign chrome.
4. Never invent evidence, line numbers, or test results.
5. Scoring: \`overall = max(5, 100 - Critical*18 - High*8 - Medium*3 - Low*1)\`.

## Data each finding must include

| Field | Notes |
|-------|--------|
| \`id\` | Anchor id, e.g. \`IP-SEC-001\` |
| \`severity\` | Critical / High / Medium / Low → card class + \`badge-*\` |
| \`title\` | Short title |
| \`pattern_id\` | Optional; show as Pattern meta tag |
| \`confidence\` | Usually High |
| \`file\` + \`lines\` | Location bar: \`path:lines\` |
| \`root_cause\` | Description + root cause text |
| \`impact\` | Concrete impact |
| \`snippet\` | Verbatim code from live source |
| \`remediation\` | Actionable fix |

ID prefixes: \`IP-SEC-*\`, \`IP-CORR-*\`, \`IP-BL-*\`, \`IP-FE-*\`, \`IP-A11Y-*\`, \`IP-TOOL-*\`.

## Review workflow

1. Scope sibling \`internship-portal/\` only; exclude nested CPMU copy, \`node_modules\`, \`.next\`; redact secrets.
2. Evidence-first; record real build/test outcomes in Verification Evidence.
3. Audit Critical/High against live code.
4. Write HTML using skeleton + Appendix A/B (or run generator if present).
5. Optional artifacts: \`audited_findings.json\`, \`test_manifest.json\` under \`reviews/internsafar-YYYYMMDD[-vN]/\`.
6. No push/commit unless asked.

## Previous tracking

If a prior review folder exists, Section 8 lists each ID as Open / Fixed / Still Open / New.

## Acceptance check

- [ ] No dependency on external \`report.html\`
- [ ] Theme toggle works (Appendix B)
- [ ] All 10 sections + TOC present with correct ids
- [ ] Finding cards use \`finding-card critical|high|medium|low\`
- [ ] Every finding has location + live snippet
- [ ] Verification matches real commands

---

## HTML skeleton (fill placeholders / repeat blocks)

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review Report - {{PROJECT}}</title>
  <!-- PASTE APPENDIX A <style> HERE -->
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <h1>CODE REVIEW REPORT</h1>
        <div class="header-actions">
          <button id="theme-toggle" class="theme-toggle-btn" onclick="toggleTheme()" aria-label="Toggle Light/Dark Theme">
            <span id="theme-icon">🌙</span> <span id="theme-text">Dark Theme</span>
          </button>
          <span class="badge" style="background: #0284c7; color: #fff; font-size: 0.85rem; padding: 0.3rem 0.75rem;">STATUS: COMPLETED</span>
        </div>
      </div>
      <div class="meta-bar">
        <span><strong>Project:</strong> {{PROJECT}}</span>
        <span><strong>Target Path:</strong> {{PATH}}</span>
        <span><strong>Date:</strong> {{DATE}}</span>
        <span><strong>Total Files Scoped:</strong> {{N}}</span>
        <span><strong>Files with Findings:</strong> {{N}}</span>
        <span><strong>Overall Score:</strong> {{SCORE}}/100</span>
      </div>
    </header>

    <nav class="report-section toc-section" id="table-of-contents">
      <div class="toc-header"><h3>TABLE OF CONTENTS &amp; QUICK NAVIGATION</h3></div>
      <div class="toc-grid">
        <!-- 8 toc-card links to:
             #section-executive-summary
             #section-frontend
             #section-backend
             #section-architecture
             #section-accessibility
             #section-master-table
             #section-verification-evidence
             #section-previous-review-tracking
             each card: .toc-num, .toc-info > .toc-title + .toc-sub -->
      </div>
    </nav>

    <section class="report-section" id="section-executive-summary">
      <div class="section-header">
        <h2>1. EXECUTIVE SUMMARY</h2>
        <span class="section-count">Overall Score: {{SCORE}}/100</span>
      </div>
      <div class="exec-stats-grid">
        <div class="stat-card"><div class="stat-val stat-critical">{{C}}</div><div class="stat-label">Critical</div></div>
        <div class="stat-card"><div class="stat-val stat-high">{{H}}</div><div class="stat-label">High</div></div>
        <div class="stat-card"><div class="stat-val stat-medium">{{M}}</div><div class="stat-label">Medium</div></div>
        <div class="stat-card"><div class="stat-val stat-low">{{L}}</div><div class="stat-label">Low</div></div>
        <div class="stat-card"><div class="stat-val stat-total">{{T}}</div><div class="stat-label">Total Findings</div></div>
      </div>
      <div class="area-table-wrapper">
        <div class="area-table-title">Severity Breakdown by Review Area</div>
        <table><!-- FRONTEND / BACKEND / ARCHITECTURE / ACCESSIBILITY rows --></table>
      </div>
      <ul class="obs-list"><!-- key observations --></ul>
    </section>

    <section class="report-section" id="section-frontend">
      <div class="section-header"><h2>2. FRONTEND REVIEW</h2><span class="section-count">…</span></div>
      <div class="categories-list">
        <div class="category-block">
          <div class="category-header">
            <div class="category-title-wrap"><span class="category-num">2.1</span><h3>…</h3></div>
            <span class="cat-badge has-findings">N Findings</span>
          </div>
          <!-- finding cards -->
        </div>
      </div>
    </section>

    <section class="report-section" id="section-backend">
      <div class="section-header"><h2>3. BACKEND &amp; IMPLEMENTATION REVIEW</h2><span class="section-count">…</span></div>
      <div class="categories-list"><!-- category-block 3.1, 3.2, … --></div>
    </section>

    <section class="report-section" id="section-architecture">
      <div class="section-header"><h2>4. ARCHITECTURE &amp; SYSTEMIC PATTERNS</h2><span class="section-count">…</span></div>
      <table><!-- Pattern ID, Name, Primary Severity, Affected Locations, Systemic Root Cause --></table>
    </section>

    <section class="report-section" id="section-accessibility">
      <div class="section-header"><h2>5. ACCESSIBILITY REVIEW (a11y)</h2><span class="section-count">…</span></div>
      <!-- categories / finding cards or empty notice -->
    </section>

    <section class="report-section" id="section-master-table">
      <div class="section-header"><h2>6. MASTER FINDINGS TABLE</h2><span class="section-count">…</span></div>
      <table class="findings-summary-table">
        <thead><tr>
          <th>ID</th><th>Area</th><th>Category</th><th>Severity</th>
          <th>Confidence</th><th>File</th><th>Lines</th><th>Title</th>
        </tr></thead>
        <tbody><!-- one row per finding; ID links to #id --></tbody>
      </table>
    </section>

    <section class="report-section" id="section-verification-evidence">
      <div class="section-header"><h2>7. VERIFICATION EVIDENCE</h2></div>
      <div class="evidence-grid">
        <div class="cmd-row">
          <div class="cmd-header">
            <span class="cmd-code">$ {{command}}</span>
            <span class="badge badge-low">PASSED</span>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-muted);">{{note}}</p>
        </div>
      </div>
    </section>

    <section class="report-section" id="section-previous-review-tracking">
      <div class="section-header"><h2>8. PREVIOUS REVIEW TRACKING</h2></div>
      <!-- table or baseline notice -->
    </section>
  </div>

  <!-- PASTE APPENDIX B <script> HERE -->
</body>
</html>
\`\`\`

### Finding card (repeat inside category-block)

\`\`\`html
<div class="finding-card {{critical|high|medium|low}}" id="{{ID}}">
  <div class="finding-header">
    <div class="finding-title-group">
      <span class="finding-id">{{ID}}</span>
      <span class="badge badge-{{sev}}">{{SEV}}</span>
      <div class="finding-title">{{TITLE}}</div>
      <div class="finding-meta-tags">
        <span class="meta-tag">Pattern: <strong>{{PATTERN}}</strong></span>
        <span class="meta-tag">Confidence: <strong>{{CONF}}</strong></span>
        <span class="meta-tag">Impact: <strong>{{SEV}}</strong></span>
      </div>
    </div>
  </div>
  <div class="location-bar">Location: <code>{{file:lines}}</code></div>
  <div class="finding-body">
    <div class="field-block">
      <div class="field-label">Description</div>
      <div class="field-content">…</div>
    </div>
    <div class="field-block">
      <div class="field-label">Root Cause &amp; Concrete Impact</div>
      <div class="field-content">…</div>
    </div>
    <div class="field-block">
      <div class="field-label">Code Evidence</div>
      <div class="evidence-block"><pre class="evidence-code">…</pre></div>
    </div>
    <div class="field-block rec-block">
      <div class="field-label" style="color: var(--low);">Actionable Remediation</div>
      <div class="field-content">…</div>
    </div>
  </div>
</div>
\`\`\`

---

## Appendix A — exact CSS (required)

`;

const mid = `

---

## Appendix B — exact theme script (required)

`;

const out = head + '\n' + style + '\n' + mid + '\n' + script + '\n';

const dest1 = path.join(ROOT, 'docs/ai-context/CODE_REVIEW_REPORT_PROMPT.md');
const dest2 = path.join(
  ROOT,
  '..',
  'Development prompts for cursor to use',
  'InternSafar_Code_Review_Report_Prompt.md'
);
fs.writeFileSync(dest1, out);
fs.writeFileSync(dest2, out);
console.log('wrote', dest1, 'bytes', out.length);
console.log('wrote', dest2);
