# AWS push reminder — 2026-09-23

**Do not forget on next AWS deploy today:** today’s sibling InternSafar changes include a **DB schema addition**.

| Item | Detail |
|------|--------|
| Migration | `db/migrations/044_ip_internship_stipend_range.sql` |
| Column | `ip_internships.stipend_inr_max` (nullable INT) |
| Why | Employer stipend **range** (min–max), e.g. ₹10,000–₹15,000 |
| Code ensure | `ensureIpInternshipStipendRangeSchema()` in `src/lib/ipInternshipStipend.js` (also via bootstrap / posting & browse routes) |

## When you Path B again today

1. **Path B alone does not run migrations** (standing rule).
2. Still need **`stipend_inr_max` on AWS RDS** before relying on range in prod:
   - Prefer applying `044_ip_internship_stipend_range.sql` on AWS (or equivalent ALTER), **or**
   - Confirm the runtime `ensure…` runs successfully against AWS on first posting/browse hit after code swap.
3. Old rows stay fine with `stipend_inr_max` NULL (= single / fixed stipend).

**Also shipped today (no extra migrate):** session revoke on logout, candidate Message create/open, profile “Add key skills” unlock, Work mode no Remote default — code-only.

Delete or archive this note after AWS has `stipend_inr_max` confirmed.
