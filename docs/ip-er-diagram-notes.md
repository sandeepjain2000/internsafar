# Internship Portal ER diagram

**Last synced:** 2026-08-26 (sibling `internship-portal`)  
**Sources:** `db/migrations/001`–`029` (`*ip*`) + `src/lib/ensureIp*.js` + `ipTwoFactor.js`

## PlantUML file

```
C:\Users\place\Work\UIUX Migration\internship-portal\docs\ip-er-diagram.puml
```

Relative: `docs/ip-er-diagram.puml`  
Render with VS Code PlantUML, IntelliJ, or https://www.plantuml.com/plantuml

---

## Guidelines (must follow)

1. **PK and FK under the table name** (entity title lines: `PK: …` / `FK: …`).  
2. **Do not dump all columns** into entity bodies. Bodies stay empty; relationships + title keys carry structure.  
3. **Two backgrounds:**
   - **CORE** (blue) — hire-pipeline integrity only  
   - **NON-ESSENTIAL** (orange) — everything else  
4. Required NON-ESSENTIAL buckets: feature ideas, sharing, points, referrals, login/auth, lookup — then **more** tables moved out as CORE is cleaned.

---

## Audit (final re-check 2026-08-26)

| Check | Result |
|---|---|
| Every entity has `PK:` under name | **Pass** (45 entities) |
| Every entity has `FK:` line under name (`FK: —` if none) | **Pass** |
| Entity bodies empty (no column lists / no body `<<PK>>`/`<<FK>>`) | **Pass** |
| No full-schema / fat columns in boxes | **Pass** |
| CORE (blue) vs NON-ESSENTIAL (orange) backgrounds | **Pass** |
| Required NON-ESSENTIAL buckets (ideas, sharing, points, referrals, login, lookup) | **Pass** |
| Extra non-core tables moved out while cleaning CORE | **Pass** (34 NON-ESSENTIAL entities) |
| CORE `ip_applications` FKs = internship + candidate only | **Pass** |
| Core hire relationships present | **Pass** |

**Verdict:** Meets the stated ER guidelines. No further structural change required for those rules.

---

## CORE tables (11)

`ip_users`, `ip_candidates`, `ip_employers`, `ip_employer_documents`, `ip_internships`, `ip_applications`, `ip_offers`, `ip_saved_internships`, `ip_message_threads`, `ip_messages`, `ip_notifications`

Logical path: accounts → candidate/employer profiles → documents/postings → applications → offers → saved + messages + notifications.

---

## NON-ESSENTIAL — required buckets

| Bucket | Tables |
|---|---|
| Feature ideas | `ip_idea_categories`, `ip_feature_ideas`, `ip_feature_idea_votes`, `ip_feature_idea_comments`, `ip_feature_idea_follows` |
| Sharing | `ip_viral_shares`, `ip_linkedin_promotions` |
| Points | `ip_points_ledger` |
| Referrals | `ip_referrals` |
| Login / auth | `ip_login_events`, `ip_auth_sessions`, `ip_password_resets`, `ip_2fa_challenges`, `ip_email_change_challenges`, `ip_phone_change_challenges`, `ip_notification_preferences` |
| Lookup | `ip_ref_cities`, `ip_ref_degrees` |

## NON-ESSENTIAL — additional (identified while shrinking CORE)

| Table | Why not CORE |
|---|---|
| `ip_employer_requests` | Manual onboarding / SuperAdmin queue |
| `ip_candidate_academics` | Profile multi-row detail |
| `ip_ratings` | Post-hire feedback |
| `ip_endorsements` | Post-hire certificates |
| `ip_generated_runs` | Test-data tagging |
| `ip_rejection_templates` | Workbench templates (optional app FK) |
| `ip_employer_lists` / `ip_employer_list_members` | Recruiter shortlists |
| `ip_saved_applicant_views` | UI saved presets |
| `ip_table_filter_prefs` | UI last-used filters |
| `ip_application_notes` | Private recruiter notes |
| `ip_application_events` | Audit timeline |
| `ip_follow_up_reminders` | Recruiter reminders |
| `ip_bulk_message_jobs` / `ip_bulk_message_recipients` | Bulk outreach |
| `ip_export_jobs` | CSV/ZIP export jobs |

---

## Not on the diagram (by design)

- **Dropped:** `ip_list_presets` (migration 022) — presets live on `ip_saved_applicant_views`.  
- **UI-only labels:** e.g. offer `Action Required`, notification presentation — app code, not DB columns.  
- **Full column schemas:** intentionally omitted; use migrations / `ensureIp*.js` for field-level detail.

## Sync note

No new `ip_*` tables from the 2026-08-26 candidate batch. Diagram rebuilt to sparse key-only titles + CORE/NON-ESSENTIAL split per guidelines.
