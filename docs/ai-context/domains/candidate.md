# Domain: Candidate

## Responsibility

Candidate dashboard, profile, browse/apply internships, applications, messages, offers, referrals, notifications.

## Central sources

| Path | Role |
|------|------|
| `src/app/candidate/**` | Pages |
| `src/app/api/ip/candidate/**` | Candidate APIs (profile, academics, internships, applications, export, uploads, saved) |
| Shared APIs | `src/app/api/ip/messages/`, `offers/`, `notifications/`, `referral/`, `files/` |
| Helpers | `src/lib/ipCandidate*.js`, `ipApplication*.js`, `ipNav.js` |
| Deep inventory | `ISM_ROUTE_INVENTORY.md` (on demand) |

## Pages (confirmed)

| Route | Purpose |
|-------|---------|
| `/candidate` | Dashboard |
| `/candidate/profile` | Profile |
| `/candidate/internships` | Browse |
| `/candidate/internships/[id]` | Detail / apply — shows every candidate-facing field the employer form saves: stipend, duration, mode, cities, hours/engagement, internship start/end dates, apply-by deadline, description, eligibility (degrees, min CGPA), preferred skills, screening questions. Every field is always listed; anything the employer left blank shows `—` (never "Not specified" / "Unpaid" wording). Screening-answer drafts are saved per device only when an answer is typed (2026-10-01) |
| `/candidate/applications` | My applications |
| `/candidate/messages`, `/candidate/messages/[id]` | Messaging |
| `/candidate/offers` | Offers |
| `/candidate/notifications` | Notifications |
| `/candidate/referral` | Refer & earn |

Nav order: `src/lib/ipNav.js` → `CANDIDATE_NAV`.

## List UX (confirmed 2026-09-18)

Several candidate list surfaces use shared `IpListPager` (`src/components/ip/IpListPager.jsx`): internships browse, offers, notifications, and message panes. Prefer that component over inventing a second pager.

Internship browse filters include **Region** (UI label; query `region`; matches employer `hq_country`) ahead of city — see `src/lib/ipRegions.js`. Profile **Country** uses searchable single-value control.

**Location rules (confirmed 2026-10-01):** changing Country clears State + City. City/State catalog (`ip_ref_cities` / `IP_REF_CITIES`) is India-only, so non-India countries get free-text City + "State / Province". `PUT /api/ip/candidate/profile` rejects a non-India country with an Indian state (`locationMismatchError` in `ipCandidateProfileUpdate.js`; Punjab excluded — also a Pakistani province). `GET` returns `availability_date` as plain `YYYY-MM-DD` (avoids previous-day shift on IST-timezone servers).

**City "Other" (2026-10-01):** India city pickers (candidate City, employer HQ City) use `src/components/ip/CitySelectWithOther.jsx` — catalog list plus a pinned **Other (not listed)** option that reveals a free-text city box (saved as-is). Posting Work cities (`PostingLocationsFields.jsx`, new + edit) allow typed custom cities (Enter / Add; exact/first match preferred over half-typed text). Catalog gained **Navi Mumbai (Maharashtra)**. `GET /api/ip/ref/cities` merges DB rows with any missing static `IP_REF_CITIES` entries and sorts by static order; `ensureIpRefCatalog()` upserts the new static city into `ip_ref_cities` on first ref call (reference data only).

Stipend display/sort may use `stipend_inr_max` when present (NULL = single/`stipend_inr` only). Browse/detail doc validation uses **active** employer docs (`superseded_at IS NULL`).

### Browse load (confirmed 2026-09-29)

- **One round trip:** first load calls `GET /api/ip/candidate/internships?useSaved=1&tab=<tab>`. The API resolves the saved view (default preset in `ip_saved_applicant_views` wins over last-used `ip_table_filter_prefs`, via `src/lib/ipListPrefs.js`), applies it, and returns `savedView` + `appliedQuery` alongside `items`/`counts`. Without `useSaved` the API behaves as before (query params only).
- Filter state ↔ query mapping lives in `src/lib/ipBrowseFilters.js` (shared by page + API). `useListPrefsSync({ serverView })` applies the server view; presets list loads in background. Other list pages still hydrate via `/api/ip/table-filter-prefs`.
- Saved view never overwrites filters the candidate changed while loading (`applySnapshot(view, { hydrate: true })`).
- States: counters `…` while loading / `—` on failure; skeleton rows; error panel + **Try again** (`browse-load-error`, `browse-retry`); expired session (`browse-session-expired`); failed refresh keeps rows (`browse-refresh-error`); empty variants `browse-empty-{filtered,none-open,all-applied,saved,starting-soon,recommended}`. Fetch via `src/lib/fetchJsonWithRetry.js` (2 quiet retries on network/5xx, 20s timeout, 401 not retried).
- Desktop result line above the list (`browse-result-line`, hidden ≤767px where `.ip-br-mcount` shows): "Showing all Y internships" or "Showing X of Y internships matching your search/filters" (Y = current tab count before filters). Shows "Updating results…" until the rows on screen came from the current filters (`shownQuery`); hidden on empty/error states.

### Applications, counters, reports (confirmed 2026-09-29)

- **In-progress rule (one definition):** Under Review / Interview always; Awaiting Review only while the posting is not `closed` and `apply_ends_at` has not passed. SQL in `api/ip/nav-badges` (sidebar badge); JS twin `isApplicationInProgress` in `src/lib/ipApplicationPresentation.js`. `GET /api/ip/candidate/applications` items now include `internship_status`, `apply_ends_at`, `in_progress` (additive).
- Dashboard card is **Active applications** (`dash-active-apps`) = count of `in_progress` (matches sidebar) with "N sent in total"; My applications **In Review** = `in_progress` minus interviews.
- My applications shows a status guide **below** the table (`application-status-guide`, from `APPLICATION_STATUS_GUIDE`) — metrics stay on top.
- After apply, detail page redirects to `/candidate/applications?applied=<id>&spent=<pts>[&bonus=<pts>]` → success banner (`apply-confirmation`) + green row highlight; dismiss clears the query. `?id=` still opens the detail dialog (notification links).
- Listing report reasons are shared in `src/lib/ipListingReportReasons.js` (form, `POST /api/ip/candidate/reports` validation, SuperAdmin Listing reports label). Values: `spam`, `misleading`, `outdated` ("Incorrect or outdated information"), `scam`, `offensive`, `duplicate`, `other`.
- Employer bulk shortlist/reject (`applicants/bulk`) now sends the candidate an "Application shortlisted/rejected" notification (only when the status actually changes), same as single status changes.

Candidate profile location/phone update path: `src/lib/ipCandidateProfileUpdate.js` + `/api/ip/candidate/profile` — preserve validation when restyling.

- Profile save (2026-10-03): the profile page never sends `college`/`degree`/`specialization`/`study_status`/`graduation_year`/`cgpa` to `PUT /api/ip/candidate/profile`; `PUT /api/ip/candidate/academics` owns education and syncs row 0. Saving another tab cannot overwrite education.
- Name rule (2026-10-07, BUG-PROFILE-001): First / Middle / Last Name (or `name` when no parts are sent) must start with a letter and contain only letters (any script, incl. combining marks), spaces, `-`, `'`/`’` and `.`. Shared helper `src/lib/ipPersonName.js` (`personNameError`, `firstPersonNameError`): `PUT /api/ip/candidate/profile` returns 400 with the field message; the profile page shows it inline under the field (`aria-invalid`) and blocks Save. Blank stays allowed here (required-ness is the existing unlock-applying check). Google-path registration takes the name from Google and is not re-validated.
- Links / handles rule (2026-10-08): shared helper `src/lib/ipProfileContact.js` (`contactFieldError`, `firstContactFieldError`, `normalizeContactFields`). LinkedIn must be a `linkedin.com/in/…` profile (also `/pub/`, `/mwlite/in/`); GitHub / Portfolio, `portfolio_url` and Personal website must be http(s) links; 255 chars max; WhatsApp must be valid for the mobile `phone_country_code` (`validateOptionalPhone`); Telegram 5–32 letters/digits/underscores starting with a letter. Saved form: bare links get `https://`, Telegram gets a leading `@`. **Only values changed since the last load/save are checked** (stored legacy values never block Save of other fields). `PUT /api/ip/candidate/profile` returns 400 with the field message; the profile page shows it inline (`aria-invalid`) and blocks Save. Link inputs are `type="text" inputMode="url"` so the browser's native URL check (scheme required) does not pre-empt the message on the submit-type Save button; they and Telegram set `spellCheck=false`, `autoCapitalize="none"`, `autoCorrect="off"`; `autoComplete="url"` only on Personal website. Input ids `ip-cp-<field>` (e.g. `#ip-cp-linkedin_url`); a failed save focuses the bad field when it is on the open tab.
- Setup & hours rule (2026-10-08): shared helper `src/lib/ipProfileSetup.js` (`hoursRangeError`, `commitmentNoteError`, `firstSetupFieldError`). Preferred hours: each side optional and only has to be a time (`HH:MM`); "to" earlier than "from" is allowed for night shifts (e.g. 22:00–02:00) — owner decision 2026-10-08, do not add an order rule; commitment note 200 chars max (`maxLength` on the input). Changed values only, same as links. `PUT /api/ip/candidate/profile` 400 with the message; inline on 4. Work Readiness.
- Profile form accessibility (2026-10-08): `Field` ties its label to a single native input/select/textarea child (`htmlFor`, auto id unless the child has one) and points `aria-describedby` at the hint + error, so `getByLabel('First Name')` works; composite controls (phone group, searchable selects, hours pair) use `aria-label`. Stable ids `ip-cp-<field>` on names, phone, links, WhatsApp, Telegram, hours, commitment note. Client save errors carry `{ tab, field }`: the save bar adds "(on the <tab> tab)" + **Go to <tab>** (`data-testid="profile-save-error"`, `profile-save-error-goto`) when the problem field is on another tab (Save sends the whole form from any tab; Save & Next moves on even when the save fails); on the same tab the field is focused.
- Profile load state (2026-10-08): `/candidate/profile` loads `GET /api/ip/candidate/profile` through `fetchJsonWithRetry` (quiet retries on network / 5xx). While loading: `IpListLoading` "Loading your profile…" (`data-testid="profile-loading"`). On failure: "We couldn't load your profile" panel with a plain reason and **Try again** (`profile-load-error`, `profile-retry`; re-runs the load effect); on 401: "Your session has expired" + Sign in again. No form (and no local-draft writes) until the profile loads. Phone width: the Resume / CV file row fits its content and the Upload button is full width.
- Offer expiry (2026-10-03): `valid_until` is a date; an offer stays open until **23:59:59 IST** that day (`offerDeadlineEnd` in `src/lib/ipOfferPresentation.js`). Dashboard pending offers + "Expires today / N days left" use the same helper.

### Medium audit fixes (confirmed 2026-10-03)

- **Confidential employers** (`ip_internships.show_employer_identity = false`): every candidate-facing surface masks company name/logo/website via `src/lib/ipEmployerIdentity.js` (`maskEmployerIdentityForCandidate`, `candidateFacingCompany`, label `CONFIDENTIAL_EMPLOYER_LABEL`) — internships list + detail, applications, saved, offers (+ detail, reminder email), points ledger, message threads (`presentThreadForRole` in `ipMessageThreadQuery.js`), employer invite notification.
- `?preview=1` bypass on candidate internship detail is **removed**; unpublished postings are not visible to candidates.
- Re-apply after withdraw is race-safe; screening question ids normalised (`ipScreeningQuestions.js`).
- Profile `resume_url` / `photo_url` accept only the candidate's own upload key (`internship-portal/candidates/<userId>/…`, `isOwnCandidateUploadUrl` in `ipCandidateProfileUpdate.js`); blank clears; any other value is ignored (existing external photo URLs untouched). Employer CV download/export also check the owner prefix before reading S3.
- Withdraw button is labelled **Withdraw application** and asks for confirmation first.
- One-time bonuses (`awardPointsOnce`) use an advisory transaction lock; viral share rewards claim atomically — no double award.
- `POST /api/ip/completions` only marks **hired** applications complete (409 otherwise).

## Constraints

- Role home is `/candidate`. Wrong-role visits get the `PortalShell` "Wrong account" block, not a redirect (`domains/auth.md`).
- Preserve live APIs, filters, and Playwright IDs when restyling.
- Apply Gemini/mobile mocks into the **sibling** app only.

## Related domains

Auth, Database, Workflow-core, UI/UX.

## Inspect before modifying

The specific `page.js` / component, matching API `route.js`, and lib helpers it imports.
