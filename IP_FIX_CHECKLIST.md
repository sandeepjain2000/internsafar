# InternSafar sibling — requested fixes checklist

> **Status (2026-08-31):** Historical log — all items below marked **Done**. Not an open-work checklist. Current product spec: [`InternSafar_Business_Requirements.txt`](InternSafar_Business_Requirements.txt).

Work tree: `internship-portal` only.

| # | Request | Done? | Notes |
|---|---|---|---|
| 1 | Pending Actions reserved on first load | Yes | Skeleton placeholders until data loads. |
| 2 | Workspace shortcuts above info cards (candidate) | Yes | |
| 3 | Applications sent card was 0 | Yes | Home fetch uses `pageSize=200` + `cache: 'no-store'`. API cap was 50 when the page asked for 100, so counts could look empty on some loads. |
| 4 | Remove hardcoded grey nav counts and HOT | Yes | Only live unread notification badges remain. |
| 5 | My applications blank | Yes | DB already had 6 apps for `lawsonlclintern+1@gmail.com`. GET now allows 200 rows, loads without tab-status wiping the list, joins offers by internship+candidate (not only `application_id`), shows API errors, and does not cache empty responses. Metrics sit **below** the table. |
| 6 | Reset then reseed apply-before-offer | Yes | `delete:ip-except-cores` then `generate:ip-test-data --mode=core-fill`. |
| 7 | Messages like PH notifications table + awaiting-reply + less scroll | Yes | Thread list is a **table** (From / Internship / Preview / When / Status). Conversation is below, not a tall card inbox. **Awaiting reply** kept. |
| 8 | Card/list toggle on card-like tabs | Yes | Browse, applications, candidate offers, notifications, ideas, employer search, employer notifications. Toggle uses indigo (`#4f46e5`), not black. Postings/offers were already tables. |
| 9 | Browse city searchable multi-select | Yes | |
| 10 | Remove HOT on Refer & earn | Yes | |
| 11 | Notifications card/list toggle | Yes | Both roles. |
| 12 | Notification time filters | Yes | |
| 13 | Refer WhatsApp-like share | Yes | |
| 14 | Refer hide info cards on mobile | Yes | |
| 15 | Employer Refer + Viral combined | Yes | |
| 16 | Employer home cards from DB; shortcuts on top | Yes | |
| 17 | Post internship locations multi-select | Yes | |
| 18 | Eligibility degree multi-select | Yes | |
| 19 | Screening not MCQs / no 5/5 | Yes | |
| 20 | Stronger Search candidates | Yes | |
| 21 | Employer messages same as candidate | Yes | Same table inbox. |
| 22 | Analytics live DB | Yes | |
| 23 | Employer refer white banners | Yes | |
| 24 | Applicants names not in grey boxes | Yes | |
| 25 | Cities + degrees catalogs | Yes | |

## Data (this pass)

Core candidate `lawsonlclintern+1@gmail.com` is left as-is (password `Admin@123`). After reseed, applications are created on live postings **before** any offer.
