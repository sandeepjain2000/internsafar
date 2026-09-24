# Review Principles

These rules are binding for the entire code review.

## Evidence and Verification

- Never state a line number, code quote, or file-specific claim unless the exact file was opened and the claim was verified against its current on-disk content.
- Code snippets in findings must be copied from the reviewed file and must match the current content exactly.
- Never report a test, lint, build, or command result unless the command was actually executed and its real output was inspected.
- Missing scripts must be reported as "not configured". Never infer that a missing script is clean or passing.
- Uncertainty must either be omitted or explicitly marked as unverified.
- Do not manufacture findings merely to increase issue count.
- An empty issue list for a reviewed file is valid.

## Source of Truth

The current repository contents are authoritative.

Do not rely on:
- Previous review reports
- Cached code
- Assumptions about framework behavior
- File names alone
- Folder names alone
- Previous line numbers
- Expected package scripts that were not actually inspected

Previous reports may be used only for comparison or regression analysis, not as evidence for a new finding.

## Categories

Only use category names defined by the applicable reference files.

Never invent a new category.

If an issue does not fit perfectly into a category, use the closest applicable category already defined by the review system.

Accessibility findings must use the `Accessibility` category rather than `Correctness`, `Frontend`, or `Best Practices`.

## Severity

Severity must follow the severity rubric defined by the main skill.

Severity must be based on:
- Impact
- Exploitability
- Scope
- User impact
- Likelihood
- Operational consequences

Do not increase severity simply because an issue appears in many files.

A systemic issue should normally be represented through a shared pattern ID rather than artificially increasing its severity.

## File Accounting

Every file identified as in scope must end in exactly one state:

- `reviewed`
- `deferred`
- `excluded`

The final accounting must satisfy:

`reviewed + deferred + excluded = total files in scope`

No file may appear in more than one state.

## Review Completeness

A file is considered reviewed only after its relevant contents have actually been inspected.

If a file is too large to inspect in one pass:
1. Read it sequentially in chunks.
2. Continue until the complete file has been inspected.
3. If complete inspection cannot be performed, mark it deferred.
4. Do not generate findings from a partially inspected file.

## Findings

Each finding should contain enough information to reproduce and understand the issue:

- File
- Line range
- Category
- Severity
- Description/message
- Suggested remediation
- Code snippet when useful and actually present
- Pattern ID when the issue belongs to a systemic pattern

Findings must describe concrete implementation problems rather than vague recommendations.

## No False Positives

Do not report:
- Hypothetical bugs without supporting code evidence
- Missing functionality that is not required by the repository's actual scope
- Style preferences as defects
- Issues based solely on assumptions
- Duplicate findings for the same root cause unless separate affected locations are materially useful

## Review Output

The review pipeline should produce machine-readable intermediate artifacts before the final report.

Expected artifacts include:

- `scope_manifest.json`
- `findings.json`
- `deferred.json`
- `test_manifest.json`
- `audited_findings.json`
- `audit_log.json`

The final report must be generated from the audited data rather than directly from ad-hoc review observations.