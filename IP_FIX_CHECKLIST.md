# InternSafar sibling — requested fixes checklist

Work tree: `internship-portal` only. Nested `campus-placement-multiuser/internship-portal` was not edited.

| # | Request | Done? | Notes |
|---|---|---|---|
| 1 | Pending Actions visible on first load (skeleton / reserved space) | Yes | Candidate home always shows the pending block; placeholders until data loads. |
| 2 | Workspace shortcuts above info cards (candidate) | Yes | Browse / applications / messages / offers / refer / profile moved above stats. |
| 3 | Applications sent card was 0 | Yes | Home loads `/api/ip/candidate/applications?pageSize=100`. After reseed, count matches DB. |
| 4 | Remove hardcoded grey nav counts (7, 7, 3) and **HOT** | Yes | Sidebar no longer badges applications / messages / offers. Referral **Hot** removed. Unread notifications still show. |
| 5 | My applications blank / offers without applications | Yes | Offers now require `application_id` FK. Orphan offers deleted. Offer API refuses send unless an application exists. Core-fill applies first, then offer, and sets application `offered`. |
| 6 | Reset data then reseed in valid order | Yes | `delete:ip-except-cores --confirm-except-cores YES` then `generate:ip-test-data --mode=core-fill`. |
| 7 | Messages like PH notifications table + awaiting-reply filter + less scroll | Partial | Added **Awaiting reply** (you sent, they have not). Inbox stays split-pane (compact thread list + conversation). Full PH-style table not a 1:1 clone. |
| 8 | Card / list toggle on card-like tabs | Partial | Browse internships, my applications, candidate offers. Notifications / feature ideas / employer search / employer offers: filters added where noted; not every employer card grid got a toggle in this pass. |
| 9 | Browse city: searchable multi-select (not checkbox list) | Yes | Typeahead multi-select from `ip_ref_cities`. |
| 10 | Remove HOT on Refer & earn (both roles) | Yes | |
| 11 | Notifications card/list toggle | Partial | Time filters added. Card/list toggle not on notifications in this pass. |
| 12 | Notification time-limit filters (both roles) | Yes | Candidate: Time-limited, 24h, 7d, 30d. Employer: Time-limited, Last 24h, Last 7 days. |
| 13 | Refer & earn WhatsApp-like share | Yes | `https://wa.me/?text=` for candidate and employer. |
| 14 | Refer & earn hide info cards on mobile | Yes | Metrics hidden under 768px. |
| 15 | Employer Refer & earn + Viral board combined | Yes | Viral nav removed; `/employer/viral` redirects to `/employer/referral`. SuperAdmin viral queue unchanged. |
| 16 | Employer home cards from DB; shortcuts on top | Yes | Applicant totals from full DB count (not first 50 postings). Shortcuts above stats. Skeleton on load. |
| 17 | Post internship locations searchable multi-select | Yes | Cities catalog. |
| 18 | Eligibility degree searchable multi-select | Yes | Degrees catalog. |
| 19 | Screening: not “MCQs”, no 5/5, ask to add another | Yes | Copy + “Add another question?”. Internal max 5 still applies. |
| 20 | Stronger Search candidates filters | Yes | City, degree, work mode plus existing skill / match-vs-posting. |
| 21 | Employer messages same as candidate | Yes | Same split-pane + awaiting-reply. |
| 22 | Analytics real DB vs fake | Yes | Already queried live applications / postings / stipend. No fake numbers found; funnel is real counts. |
| 23 | Employer refer purple banners → white | Yes | Hero flattened; dark-surface white-on-purple override removed for refer. |
| 24 | Applicants: names not in grey boxes | Yes | Removed greyed row background; screening flag remains as text. |
| 25 | Cities + degrees databases | Yes | `ip_ref_cities`, `ip_ref_degrees` + `/api/ip/ref/cities` and `/api/ip/ref/degrees`. Seeded from the tables you provided (+ Remote / Remote / Hybrid). |

## Data reset (this session)

1. Migration `019_ip_ref_catalog_offer_fk.sql` (also applied at runtime via offer schema ensure).
2. Wipe non-core users: `npm run delete:ip-except-cores -- --confirm-except-cores YES`
3. Reseed: `npm run generate:ip-test-data -- --mode=core-fill`

Core logins unchanged (`Admin@123`).
