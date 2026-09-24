# Donation App — Skill Test

## Purpose

Use the Donation App as the baseline repository for validating the Unified Code Review skill.

## Test Objectives

The skill must:

- Establish an authoritative review scope.
- Review every in-scope file or explicitly defer it.
- Detect concrete frontend issues.
- Detect accessibility issues.
- Detect backend/API issues.
- Detect security issues.
- Detect systemic patterns across multiple files.
- Execute available test/lint commands.
- Verify all reported line numbers and snippets.
- Deduplicate findings with the same root cause.
- Generate `audited_findings.json`.
- Generate `audit_log.json`.
- Generate a Markdown report.
- Generate a self-contained HTML report.

## Expected Behavior

The new unified review should preserve the strengths of both previous review systems:

### Architecture/System Level

The review should identify:

- systemic security issues
- architectural problems
- shared implementation patterns
- root causes
- cross-file inconsistencies

### Granular/File Level

The review should identify:

- specific implementation issues
- frontend issues
- accessibility issues
- testing/lint issues
- file-level evidence

### Deduplication

Multiple instances of the same root cause should be connected using a shared `pattern_id`.

The review must not treat every occurrence as an unrelated root cause.

## Regression Comparison

Compare the unified review against the previous:

1. Claude Markdown review
2. Six-prompt HTML review

The purpose is not to reproduce the exact issue count.

Instead verify:

- important findings were retained
- duplicate findings were consolidated appropriately
- systemic issues remain visible
- granular file-level evidence remains visible
- accessibility findings remain categorized correctly
- test/lint results are evidence-based
- no unsupported findings were introduced

## Acceptance Criteria

The skill passes this test when:

- scope accounting is correct
- findings are evidence-backed
- line references are verified
- test/lint results are real
- systemic patterns are identified
- duplicates are synthesized
- Markdown output is generated
- HTML output is generated
- final reports contain only audited data