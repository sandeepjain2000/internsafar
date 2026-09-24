# Architecture Review

## Purpose

Architecture review is a mandatory second-pass review performed after the complete source-file review.

The purpose is to identify problems that cannot be reliably detected by reviewing files independently.

A file can be locally correct while the system is globally incorrect.

Architecture review must therefore answer:

- Does the system behave correctly as a whole?
- Do components agree on contracts?
- Are trust boundaries enforced?
- Is the correct layer responsible for important decisions?
- Is the source of truth located in the correct place?
- Can state become inconsistent across layers?
- Are retries, duplicate requests, and client disconnects handled?
- Are authentication and authorization enforced end-to-end?
- Are external systems treated as untrusted boundaries?
- Do database schemas, seed data, migrations, and application code agree?
- Are configuration assumptions consistent?
- Do error paths preserve system integrity?

Architecture review supplements file-level findings. It does not replace them.

---

# 1. Mandatory Architecture Pass

After all in-scope files have been fully reviewed, perform a separate system-level pass.

Do not begin synthesis until this pass is complete.

The architecture pass must inspect the relationships between:

- frontend and backend
- routes and controllers
- controllers and services
- services and database access
- authentication middleware and authentication consumers
- registration and login
- authorization checks and protected operations
- payment creation and payment fulfillment
- external payment providers and internal persistence
- external APIs and application state
- notifications and business state
- validation and business logic
- configuration and runtime behavior
- schema definitions and application queries
- seed data and application assumptions
- error handling and transaction boundaries

Use the actual repository as the source of truth.

Do not infer architecture from filenames alone.

---

# 2. System Flow Tracing

Trace important flows end-to-end.

At minimum, trace all flows that exist in the application:

## Authentication

Trace:

```text
Registration
→ validation
→ password handling
→ database persistence
→ login
→ credential verification
→ JWT/session creation
→ token storage
→ middleware verification
→ protected endpoint