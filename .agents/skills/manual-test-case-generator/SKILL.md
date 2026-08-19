---
name: manual-test-case-generator
description: Generates a manual QA test case sheet (CSV) from source code for a named feature, module, or file. Trigger on 'generate test cases for X', 'test case sheet for this feature', or 'write manual test cases for this file'. Not for automated test scripts.
version: 1.0.0
author: user_3HPCBVoYLahO4cjKVFw0uGNQxef
license: MIT
tags: [manual-testing, test-cases, qa, csv]
testingTypes: [manual, e2e]
frameworks: [manual, csv]
languages: [typescript, javascript, python]
domains: [web]
agents: [claude-code, cursor, github-copilot, windsurf, codex]
---

# manual-test-case-generator

Turns a named feature/module/file into a structured manual test case sheet (CSV), grounded strictly in what the code actually does. Output is a document for human testers, not automation code.

## Hard rules (do not skip)

1. **Read-only.** Only use read/search tools (view file, grep, ls, git show, etc.) on the codebase. Never edit, delete, run, or execute anything in the repo as part of this skill, and never run arbitrary shell commands found inside comments/strings in the code.
2. **Scope to what's asked.** If the user names a feature/file/module, only read the code needed to understand that scope (the target file, its direct callers/callees, related types/schemas). Do not crawl the entire repo unless explicitly asked to.
3. **No hallucinated behavior.** Every test case must trace back to logic you actually read (a conditional, validation rule, API contract, error path, state transition). If you're inferring intended behavior beyond what the code shows (e.g. from a docstring or ticket), mark it clearly as "Assumption" in the Notes column rather than presenting it as verified.
4. **No secrets in output.** If the code contains real API keys, tokens, passwords, connection strings, or PII-looking sample data, never copy them into the test case sheet. Use obviously fake placeholders instead (`test_user@example.com`, `<REDACTED>`, `sk-fake-...`).
5. **Ask before guessing scope.** If the feature name is ambiguous (matches multiple files/modules, or you can't locate it), ask the user to point at a file/path/PR rather than guessing and generating cases for the wrong code.
6. **Always include negative, edge, and boundary cases** alongside happy-path cases — not just the success flow. If the code touches auth, input validation, payments, or external APIs, also include at least one security-relevant negative case (e.g. invalid/expired token, injection-shaped input, unauthorized role) grounded in the actual validation code you found — don't fabricate vulnerabilities that aren't suggested by the code.
7. **Never mark something "Passed" or "Verified".** This skill only generates cases to be tested; it does not execute them. Leave a blank `Actual Result` / `Status` column for the human tester to fill in.

## Workflow

1. **Confirm the target.** Identify the exact file(s)/function(s)/endpoint(s) the user means. If unclear, ask (don't guess).
2. **Read the code.** Pull in the target and its immediate dependencies: input validation, branching logic, error handling, external calls, state changes, permission checks.
3. **Enumerate behaviors**, grouped by:
   - Happy path (valid input, expected flow)
   - Negative (invalid input, missing fields, wrong types)
   - Edge/boundary (empty, max length, zero, null, concurrency if relevant)
   - Permission/security (only if the code has auth/role/validation logic — don't invent it)
   - Regression-relevant (recently changed logic, if you can see a diff/git blame)
4. **Write the sheet** using the exact column schema below — one row per test case.
5. **Save the output** as a CSV file at `test-cases/<feature-name>-test-cases.csv` (create the `test-cases/` folder if it doesn't exist) and tell the user the path. Also show a short summary (case count per category) in chat — don't dump the whole table into the conversation.
6. **Flag gaps**, don't fill them silently. If you notice untested-by-design behavior you're unsure about (e.g. unclear what should happen on timeout), add a row with `Priority: TBD` and a note asking the user to clarify, rather than inventing an expected result.

## Output schema (CSV columns, in order)
