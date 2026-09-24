# InternSafar / unified code-review report (self-contained prompt)

**This prompt alone is enough.** You do **not** need `report.html`, any sample HTML, or other external files to produce a report identical in format to the v2 shell.

If `scripts/generate-code-review-report-v2.cjs` + shell files exist in the repo, prefer running the generator for speed. If they do not exist, **write the HTML yourself** using:
1. The **HTML skeleton** (class names + section order) below
2. The **exact CSS** in Appendix A (paste into `<head>`)
3. The **exact theme JS** in Appendix B (paste before `</body>`)
4. Your audited findings as dynamic fill

Never invent a different layout or CSS theme.

---

## Mode

Unified code review of InternSafar (sibling `internship-portal/` only). Do not start remediations unless the user asks after the report.

## Non-negotiable rules

1. Output one **self-contained** `.html` file (CSS + JS inline from Appendix A/B).
2. Use **exactly** the class names and section `id`s in the skeleton.
3. Fill only dynamic text/counts/findings/evidence — do not redesign chrome.
4. Never invent evidence, line numbers, or test results.
5. Scoring: `overall = max(5, 100 - Critical*18 - High*8 - Medium*3 - Low*1)`.

## Data each finding must include

| Field | Notes |
|-------|--------|
| `id` | Anchor id, e.g. `IP-SEC-001` |
| `severity` | Critical / High / Medium / Low → card class + `badge-*` |
| `title` | Short title |
| `pattern_id` | Optional; show as Pattern meta tag |
| `confidence` | Usually High |
| `file` + `lines` | Location bar: `path:lines` |
| `root_cause` | Description + root cause text |
| `impact` | Concrete impact |
| `snippet` | Verbatim code from live source |
| `remediation` | Actionable fix |

ID prefixes: `IP-SEC-*`, `IP-CORR-*`, `IP-BL-*`, `IP-FE-*`, `IP-A11Y-*`, `IP-TOOL-*`.

## Review workflow

1. Scope sibling `internship-portal/` only; exclude nested CPMU copy, `node_modules`, `.next`; redact secrets.
2. Evidence-first; record real build/test outcomes in Verification Evidence.
3. Audit Critical/High against live code.
4. Write HTML using skeleton + Appendix A/B (or run generator if present).
5. Optional artifacts: `audited_findings.json`, `test_manifest.json` under `reviews/internsafar-YYYYMMDD[-vN]/`.
6. No push/commit unless asked.

## Previous tracking

If a prior review folder exists, Section 8 lists each ID as Open / Fixed / Still Open / New.

## Acceptance check

- [ ] No dependency on external `report.html`
- [ ] Theme toggle works (Appendix B)
- [ ] All 10 sections + TOC present with correct ids
- [ ] Finding cards use `finding-card critical|high|medium|low`
- [ ] Every finding has location + live snippet
- [ ] Verification matches real commands

---

## HTML skeleton (fill placeholders / repeat blocks)

```html
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
```

### Finding card (repeat inside category-block)

```html
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
```

---

## Appendix A — exact CSS (required)


<style>
    :root {
      --bg: #0b1329;
      --card-bg: #151f38;
      --card-border: #233256;
      --text: #f8fafc;
      --text-muted: #8fa0be;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #10b981;
      --code-bg: #f8fafc;
      --code-border: #cbd5e1;
      --code-text: #b91c1c;
      --table-stripe: rgba(255, 255, 255, 0.02);
      --toc-bg: #0f1830;
      --toc-card-bg: #152244;
      --toc-hover: #1e305e;
    }
    body.light-theme {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --critical: #dc2626;
      --high: #ea580c;
      --medium: #d97706;
      --low: #059669;
      --code-bg: #f1f5f9;
      --code-border: #cbd5e1;
      --code-text: #b91c1c;
      --table-stripe: rgba(0, 0, 0, 0.02);
      --toc-bg: #f8fafc;
      --toc-card-bg: #ffffff;
      --toc-hover: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.75rem 1rem;
      transition: background-color 0.2s ease, color 0.2s ease;
      font-size: 0.92rem;
    }
    .container {
      max-width: 1240px;
      margin: 0 auto;
    }
    header {
      border-bottom: 2px solid var(--card-border);
      padding-bottom: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    h1 { font-size: 1.85rem; color: var(--text); font-weight: 800; letter-spacing: -0.025em; }
    .theme-toggle-btn {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--toc-hover);
      border-color: var(--primary);
    }
    .meta-bar {
      margin-top: 0.5rem;
      display: flex;
      gap: 1.25rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      flex-wrap: wrap;
    }

    /* Table of Contents / Quick Navigation Index */
    .toc-section {
      background: var(--toc-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.75rem;
    }
    .toc-header {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .toc-header h3 {
      font-size: 0.92rem;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 700;
    }
    .toc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.5rem;
    }
    .toc-card {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: var(--toc-card-bg);
      border: 1px solid var(--card-border);
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      text-decoration: none;
      color: var(--text);
      transition: all 0.15s ease;
    }
    .toc-card:hover {
      border-color: var(--primary);
      background: var(--toc-hover);
      transform: translateY(-1px);
    }
    .toc-num {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--primary);
      font-weight: 800;
      font-size: 0.8rem;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .toc-info { display: flex; flex-direction: column; }
    .toc-title { font-weight: 600; font-size: 0.86rem; }
    .toc-sub { font-size: 0.72rem; color: var(--text-muted); }

    .report-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.75rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .section-header h2 { font-size: 1.25rem; color: var(--primary); font-weight: 700; letter-spacing: -0.01em; }
    .section-count {
      background: var(--bg);
      border: 1px solid var(--card-border);
      padding: 0.25rem 0.65rem;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text);
    }
    
    /* Executive Summary Cards & Severity Table */
    .exec-stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 800px) {
      .exec-stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-card {
      background: var(--bg);
      border: 1px solid var(--card-border);
      padding: 0.85rem 0.5rem;
      border-radius: 6px;
      text-align: center;
    }
    .stat-val { font-size: 1.8rem; font-weight: 800; line-height: 1; }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-top: 0.35rem; font-weight: 600; letter-spacing: 0.04em; }
    .stat-critical { color: var(--critical); font-weight: 700; }
    .stat-high { color: var(--high); font-weight: 700; }
    .stat-medium { color: var(--medium); font-weight: 700; }
    .stat-low { color: var(--low); font-weight: 700; }
    .stat-total { color: var(--primary); font-weight: 700; }

    .area-table-wrapper {
      margin-bottom: 1.25rem;
    }
    .area-table-title {
      font-size: 0.88rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-bottom: 0.5rem;
    }

    .obs-list {
      margin-top: 0.75rem;
      padding-left: 1.25rem;
    }
    .obs-list li { margin-bottom: 0.4rem; color: var(--text); font-size: 0.88rem; }

    .categories-list { display: flex; flex-direction: column; gap: 1.25rem; }
    .category-block {
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 1rem 1.25rem;
    }
    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--card-border);
    }
    .category-title-wrap { display: flex; align-items: center; gap: 0.4rem; }
    .category-num { color: var(--primary); font-weight: 700; font-size: 0.95rem; }
    .category-header h3 { font-size: 1rem; color: var(--text); font-weight: 700; }
    .cat-badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-weight: 700;
    }
    .has-findings { background: var(--high); color: #fff; }
    .zero-findings { background: var(--card-border); color: var(--text-muted); }
    .empty-category-notice { color: var(--text-muted); font-size: 0.85rem; padding: 0.25rem 0; font-style: italic; }

    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      margin-top: 0.75rem;
      padding: 1rem 1.15rem;
    }
    .finding-card.critical { border-left: 4px solid var(--critical); }
    .finding-card.high { border-left: 4px solid var(--high); }
    .finding-card.medium { border-left: 4px solid var(--medium); }
    .finding-card.low { border-left: 4px solid var(--low); }

    .finding-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .finding-title-group { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; width: 100%; }
    .finding-id { font-weight: 800; font-size: 0.88rem; color: var(--primary); letter-spacing: 0.02em; }
    .finding-title { font-size: 1.02rem; font-weight: 700; color: var(--text); width: 100%; margin-top: 0.2rem; }
    .finding-meta-tags { display: flex; gap: 0.85rem; margin-top: 0.2rem; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap; }
    .meta-tag strong { color: var(--text); }

    .location-bar {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--card-border);
      padding: 0.35rem 0.65rem;
      border-radius: 4px;
      margin-bottom: 0.75rem;
      font-size: 0.8rem;
    }
    body.light-theme .location-bar {
      background: #e2e8f0;
    }
    .location-bar code { color: var(--primary); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; }

    .badge {
      font-size: 0.68rem;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-critical { background: var(--critical); color: #fff; }
    .badge-high { background: var(--high); color: #fff; }
    .badge-medium { background: var(--medium); color: #000; }
    .badge-low { background: var(--low); color: #fff; }

    .finding-body { display: flex; flex-direction: column; gap: 0.65rem; font-size: 0.88rem; }
    .field-block { display: flex; flex-direction: column; gap: 0.2rem; }
    .field-label { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
    .field-content { color: var(--text); line-height: 1.45; }
    
    /* Light readable background for code evidence */
    .evidence-block {
      background: #f1f5f9;
      border: 1px solid var(--code-border);
      padding: 0.65rem 0.85rem;
      border-radius: 4px;
    }
    .evidence-code {
      color: #991b1b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.82rem;
      white-space: pre-wrap;
      word-break: break-all;
      background: transparent;
      font-weight: 500;
    }
    .rec-block {
      background: rgba(16, 185, 129, 0.08);
      border-left: 3px solid var(--low);
      padding: 0.65rem 0.85rem;
      border-radius: 0 4px 4px 0;
    }
    .rec-block .field-content { color: var(--text); }

    .findings-summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.81rem;
      table-layout: fixed;
    }
    .findings-summary-table th, .findings-summary-table td {
      border: 1px solid var(--card-border);
      padding: 0.45rem 0.5rem;
      text-align: left;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .findings-summary-table th {
      background: var(--bg);
      color: var(--text-muted);
      text-transform: uppercase;
      font-size: 0.70rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .findings-summary-table tr:nth-child(even) { background: var(--table-stripe); }
    .findings-summary-table td code {
      background: rgba(56, 189, 248, 0.1);
      padding: 0.1rem 0.25rem;
      border-radius: 3px;
      font-size: 0.76rem;
      color: var(--primary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }
    th, td {
      border: 1px solid var(--card-border);
      padding: 0.55rem 0.7rem;
      text-align: left;
    }
    th { background: var(--bg); color: var(--text-muted); text-transform: uppercase; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; }
    tr:nth-child(even) { background: var(--table-stripe); }
    td code { background: rgba(56, 189, 248, 0.1); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.78rem; color: var(--primary); }

    .evidence-grid { display: flex; flex-direction: column; gap: 0.75rem; }
    .cmd-row {
      background: var(--bg);
      border: 1px solid var(--card-border);
      padding: 0.75rem;
      border-radius: 4px;
    }
    .cmd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
    .cmd-code { color: var(--primary); font-family: monospace; font-size: 0.85rem; font-weight: 700; }
  </style>


---

## Appendix B — exact theme script (required)


<script>
    
    function toggleTheme() {
      const isLight = document.body.classList.toggle('light-theme');
      const icon = document.getElementById('theme-icon');
      const text = document.getElementById('theme-text');
      if (isLight) {
        if (icon) icon.textContent = '☀️';
        if (text) text.textContent = 'Light Theme';
        try { localStorage.setItem('review_report_theme', 'light'); } catch(e) {}
      } else {
        if (icon) icon.textContent = '🌙';
        if (text) text.textContent = 'Dark Theme';
        try { localStorage.setItem('review_report_theme', 'dark'); } catch(e) {}
      }
    }

    (function() {
      try {
        if (localStorage.getItem('review_report_theme') === 'light') {
          document.body.classList.add('light-theme');
          const icon = document.getElementById('theme-icon');
          const text = document.getElementById('theme-text');
          if (icon) icon.textContent = '☀️';
          if (text) text.textContent = 'Light Theme';
        }
      } catch(e) {}
    })();
  
  </script>
