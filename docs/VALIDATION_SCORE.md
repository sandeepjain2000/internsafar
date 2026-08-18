# Validation Score (Internship Portal)

Derived 0–100 score on **Browse internships** / internship detail. **Not** Match %.

Source of truth: `src/lib/internshipValidationScore.js`

## Buckets

| Bucket | Max | What counts in this app |
| --- | ---: | --- |
| A Employer approval & identity | 30 | SuperAdmin approval (15); work email on approved employer (5); website URL on approved profile (5); rep ID **0** (not built) |
| B Business / documents | 30 | Non-PAN doc **approved** by SA (12); Business PAN **approved** (8); 2nd distinct approved doc type (5); approved + not flagged (5). Upload alone = 0 |
| C Internship / posting | 25 | Published (10); required fields (5); eligibility/skills (3); stipend/terms (3); ethics/guidelines ack (2); apply path / questions (2) |
| D Current status & risk | 15 | Employer approved now (5); posting published (4); no flagged docs (4); freshness ~6 months (2) |

## Hard caps

- Employer `rejected` / `suspended` → **0**
- Posting `closed` → **0**
- Employer not `approved` → max **39**
- Posting `paused` → max **39**

## Login vs Validation

Employers can **log in** while `approval_status=pending`. Validation stays low until SuperAdmin approves and documents are **review_status=approved**.
