---
name: code-review
description: >
  Perform a comprehensive, evidence-driven code review of a repository.
  Reviews every in-scope source file, performs dedicated frontend/backend,
  accessibility, security, architecture, testing, and systemic root-cause
  analysis, deduplicates findings, audits all evidence, and generates
  self-contained HTML and Markdown reports.
---

# Code Review Skill

You are performing a repository code review.

The goal is not to maximize the number of findings.

The goal is to produce a technically accurate review that combines:

1. File-level implementation analysis
2. Frontend analysis
3. Backend/API analysis
4. Accessibility analysis
5. Security analysis
6. Architecture analysis
7. Cross-file consistency analysis
8. Testing/lint/build evidence
9. Systemic root-cause analysis
10. Deduplicated, audited reporting

The repository itself is the source of truth.

Do not invent evidence, commands, findings, files, line numbers, test results, or architecture.

---

# Reference Files

Use the following reference files as binding review guidance:

- `references/review-principles.md`
- `references/frontend.md`
- `references/backend.md`
- `references/security.md`
- `references/architecture.md`
- `references/testing.md`
- `references/synthesis.md`

Read the relevant reference files before performing their corresponding review phases.

---

# Canonical Report Template

The final HTML report MUST be generated from:

`templates/report.html`

This file is the canonical and immutable report template for this skill.

The template is not an example, inspiration, or optional starting point.

## Template Rules

The report generator MUST:

1. Read `templates/report.html` before generating the final HTML report.
2. Preserve the template's existing HTML structure.
3. Preserve the template's CSS.
4. Preserve the template's JavaScript.
5. Preserve the template's light/dark theme behavior.
6. Preserve the template's navigation and table of contents.
7. Preserve the template's accessibility structure.
8. Preserve the template's severity styling.
9. Preserve the template's score presentation.
10. Preserve all existing report sections unless a section is explicitly required by the audited data model.
11. Populate the template using the audited review data.
12. Replace only report-specific values, finding data, test results, metadata, and other dynamic content.
13. Preserve `window.__REPORT__` or the template's equivalent embedded report-data structure when present.
14. Never redesign the report for a specific repository.
15. Never create a new HTML layout when `templates/report.html` exists.
16. Never use a previously generated report in `reviews/` as the template.

The generated report may differ in:
- repository name
- review timestamp
- scope statistics
- scores
- severity counts
- category counts
- findings
- affected locations
- systemic patterns
- test/lint/build results
- deferred files
- excluded files
- coverage statistics

The generated report MUST NOT differ in its fundamental visual structure or reporting UX.

## Template Integrity

Before finalizing the report:

- verify that `templates/report.html` exists
- verify that it was used as the rendering source
- verify that the generated report contains the required template sections
- verify that the generated report remains self-contained
- verify that all displayed findings come from `audited_findings.json`
- verify that all displayed test results come from `test_manifest.json`
- verify that scope information comes from `scope_manifest.json`
- verify that audit information is consistent with `audit_log.json`

If the template cannot be found or cannot be used, do not silently substitute another report design.

Mark the report generation step as failed and explain the missing template.

---

# Core Rule

A code review finding must be supported by actual repository evidence.

Never report:

- guessed line numbers
- guessed behavior
- guessed test results
- guessed package scripts
- hypothetical vulnerabilities without implementation evidence
- framework assumptions that are not verified
- issues merely because they are considered "best practice"

If something important cannot be verified, explicitly mark it as:

`unverified`

or omit it.

---

# REVIEW PIPELINE

The review MUST follow this order.

```text
Phase 1  → Setup
Phase 2  → Scope Discovery
Phase 3  → Complete File Review
Phase 4  → Testing / Lint / Build
Phase 5  → Systemic Architecture Review
Phase 6  → Systemic Security Review
Phase 7  → Synthesis + Root-Cause Deduplication
Phase 8  → Consistency Audit
Phase 9  → Report Generation Using Canonical Template
Phase 10 → Final Validation

---

# InternSafar / this workspace override

Canonical HTML shell for reports in this workspace is the filled sample style of `templates/report.html` (copied from workspace `report.html`). Generate with `node scripts/generate-code-review-report-v2.cjs`. Standing prompt: `docs/ai-context/CODE_REVIEW_REPORT_PROMPT.md`.

