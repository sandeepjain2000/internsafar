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
| `/candidate/internships/[id]` | Detail / apply |
| `/candidate/applications` | My applications |
| `/candidate/messages`, `/candidate/messages/[id]` | Messaging |
| `/candidate/offers` | Offers |
| `/candidate/notifications` | Notifications |
| `/candidate/referral` | Refer & earn |

Nav order: `src/lib/ipNav.js` → `CANDIDATE_NAV`.

## List UX (confirmed 2026-09-18)

Several candidate list surfaces use shared `IpListPager` (`src/components/ip/IpListPager.jsx`): internships browse, offers, notifications, and message panes. Prefer that component over inventing a second pager.

Internship browse filters include **Region** (UI label; query `region`; matches employer `hq_country`) ahead of city — see `src/lib/ipRegions.js`. Profile **Country** uses searchable single-value control.

Stipend display/sort may use `stipend_inr_max` when present (NULL = single/`stipend_inr` only). Browse/detail doc validation uses **active** employer docs (`superseded_at IS NULL`).

Candidate profile location/phone update path: `src/lib/ipCandidateProfileUpdate.js` + `/api/ip/candidate/profile` — preserve validation when restyling.

## Constraints

- Role home is `/candidate`. Wrong-role redirects via `PortalShell`.
- Preserve live APIs, filters, and Playwright IDs when restyling.
- Apply Gemini/mobile mocks into the **sibling** app only.

## Related domains

Auth, Database, Workflow-core, UI/UX.

## Inspect before modifying

The specific `page.js` / component, matching API `route.js`, and lib helpers it imports.
