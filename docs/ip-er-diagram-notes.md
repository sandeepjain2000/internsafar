# Internship Portal ER diagram

**Last synced:** 2026-08-27 (sibling `internship-portal`)  
**Sources:** live Postgres catalog + `db/migrations/001`–`029` (`*ip*`) + `src/lib/ensureIp*.js` + `ipTwoFactor.js`

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
   - **NON-ESSENTIAL** (orange) — everything else (split into bucket packages in the `.puml`)  
4. Required NON-ESSENTIAL buckets: feature ideas, sharing, points, referrals, login/auth, lookup — then **more** tables moved out as CORE is cleaned.

---

## Sync delta (2026-08-27 vs prior diagram)

| Change | Detail |
|---|---|
| Live table count | **45** `ip_*` tables — same set; none added/removed since prior draw |
| `ip_users` FKs | Now lists `referred_by → ip_users` and `generated_run_id → ip_generated_runs` (were missing under title) |
| Integrity UNIQUEs in titles | Noted on applications, offers, saved_internships, ratings, endorsements, list_members, table_filter_prefs |
| NON-ESSENTIAL layout | Split into nested orange packages (ideas / sharing / points / referrals / auth / lookup / workbench) |
| Relationships | Added missing edges (self-referral, ratings↔users, endorsements↔candidates, bulk recipients, export created_by, etc.) |
| CORE `ip_applications` | Title still hire-path FKs only (internship + candidate); optional `rejection_template_id` stays dotted to NON-ESSENTIAL |

Integrity audit the same day: `db:check-integrity` → **ok** (no open FK/orphan issues).

---

## Audit checklist

| Check | Result |
|---|---|
| Every entity has `PK:` under name | **Pass** (45 entities) |
| Every entity has `FK:` line under name (`FK: —` if none) | **Pass** |
| Entity bodies empty (no column lists) | **Pass** |
| CORE (blue) vs NON-ESSENTIAL (orange) backgrounds | **Pass** |
| Required NON-ESSENTIAL buckets | **Pass** |
| Extra non-core tables outside CORE | **Pass** |
| Matches live FK catalog | **Pass** |

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

## NON-ESSENTIAL — additional (workbench / support / post-hire)

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
