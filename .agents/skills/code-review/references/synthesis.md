# Synthesis

## Purpose

Synthesis combines granular findings with architecture and security analysis into one coherent set of findings.

The goal is:

> maximum useful coverage with minimum duplication.

The final result must represent the application's actual root causes while preserving enough file-level evidence for engineers to locate and fix the problems.

---

# Inputs

Synthesis may use:

- `findings.json`
- architecture observations
- security observations
- frontend observations
- backend observations
- testing results
- `scope_manifest.json`
- current repository contents

The final report must only contain verified findings.

---

# Two-Level Review Model

The review has two complementary levels.

## Level 1 — Local Findings

These identify concrete problems in individual files.

Examples:

- missing accessible label
- incorrect validation
- unsafe type cast
- missing error handling
- insecure configuration
- incorrect API behavior

These findings are useful evidence and may remain independent when their root cause is local.

---

## Level 2 — Systemic Findings

These identify root causes spanning multiple files or layers.

Examples:

- insecure authentication configuration
- client-authoritative payment flow
- schema/application divergence
- duplicated authorization logic
- inconsistent validation boundaries

Both levels are valuable during analysis.

However, when multiple local findings are proven to be manifestations of one root cause, the systemic finding becomes the primary final finding.

Do not discard the granular evidence.

Move it under the systemic finding as affected locations/evidence.

---

# Logical Findings vs Affected Locations

A critical distinction:

```text
Logical finding
=
one distinct root cause / defect

Affected locations
=
all verified places where that root cause appears or produces consequences