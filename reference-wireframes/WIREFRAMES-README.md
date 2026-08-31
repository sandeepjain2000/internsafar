# Internship Portal — Combined UI Prototype

A single-file, clickable HTML prototype that merges the base wireframe set with the offer-flow add-on, restyled with a **Placement Hub / ISM-style** production look (indigo primary, slate neutrals, card-based layout, Outfit/Inter typography) instead of the original dashed "wireframe-box" look.

## How to open

1. Open `combined.html` directly in any modern browser (double-click it, or drag it into a browser window). No build step, server, or install required — it's fully self-contained and loads Tailwind CSS, Font Awesome, and Google Fonts from CDNs.
2. Use the dark top navigator to jump between screens. It's grouped into dropdown menus: **Auth | Candidate | Employer | SuperAdmin | Viral/Share | Ideas | Offers | Gaps (Endorsement/Ratings)**.
3. Everything is click-driven via a single `showScreen('some-id')` router in a `<script>` block at the bottom of the file — clicking buttons/cards swaps which `.screen` div is visible.

## What this is — and isn't

- ✅ This is a **clickable UI prototype** for reviewing flows and requirements coverage.
- ❌ It is **not** the production backend. There are no real Google OAuth keys, no real email/WhatsApp/Telegram delivery, and no real LinkedIn API calls — every such action is a mocked `alert()` or a local modal (see the amber disclaimer banner inside the prototype itself).
- The production app will live in a **separate Next.js codebase**, built later. Live Google OAuth wiring for registration is still **TBD** at that point.
- This deliverable intentionally lives **outside** `employer-student-internship` and does not modify it or `campus-placement-multiuser`.

## Sources merged

1. **Base (most complete):** `internship_portal_wireframes (6).html`
2. **Offer flow add-on (supersedes/extends where overlapping):** `internship_incremental_only.html`

Where both files defined the same screen (e.g. `candidate-dashboard-screen`, `employer-dashboard-screen`, `candidate-public-profile-screen`, `communication-screen`, `superadmin-dashboard-screen`), the richer (6) version was kept as the base and the incremental file's offer-flow hooks (pending-offer banners, "Make Offer" / "Review Offer" CTAs) were merged in.

## Bugs fixed from source file (6)

- **`linkedin-mock-screen` was duplicated**, and the second definition was broken/truncated (leftover `</form>` fragments with no content), which meant the working LinkedIn compose mock further up the file was shadowed. There is now exactly **one** `linkedin-mock-screen`, and it renders the full mock LinkedIn "Create a post" composer with link preview and Post button.
- **`employer-post-internship-screen` was referenced by 4+ `showScreen()` calls but never defined anywhere** in the source file — clicking "Post Internship" was a dead link. It has been rebuilt as a full 4-tab multi-section form (Basic Details → Requirements → Stipend & Schedule → Review & Publish), matching the app's `FORM_PATTERN` tab-based UX for multi-section create forms.
- Verified programmatically that **every** `showScreen('...')` call target now resolves to an existing screen id (26/26), with **no duplicate ids** anywhere in the document.

## Screen inventory (26 screens)

| Group | Screen ID | Notes |
|---|---|---|
| Auth | `landing-screen` | Login + registration chooser |
| Auth | `password-reset-screen` | Forgot password |
| Auth | `register-candidate-screen` | Google-only signup |
| Auth | `register-employer-screen` | Domain-match auto-verify + manual mismatch request form |
| Candidate | `candidate-profile-screen` | Mandatory profile completion, WhatsApp/Telegram opt-in, visibility & privacy |
| Candidate | `candidate-dashboard-screen` | Stats, eligibility filters, match list, referral sidebar, **pending-offer banner** |
| Candidate | `candidate-messages-screen` | **New** — candidate inbox mirroring employer inbox filters (unread / posting / date range / pending reply / sort) |
| Employer | `employer-profile-screen` | Company details, trust/transparency toggle, employer referral |
| Employer | `employer-dashboard-screen` | Stats, recent applicants w/ **Make Offer** CTA, AI insights teaser linking to full analytics |
| Employer | `employer-post-internship-screen` | **Rebuilt** — 4-tab multi-section create form |
| Employer | `employer-postings-screen` | Manage postings, share (LinkedIn/WhatsApp/mobile sheet/copy link), export |
| Employer | `employer-search-screen` | Searchable candidate pool, PII-hidden-until-invite, invite to role |
| Employer | `candidate-public-profile-screen` | Employer's view of a candidate; **Make Official Offer**, **Rate Candidate** CTAs |
| Employer | `communication-screen` | Universal inbox (employer view), WhatsApp/Telegram deep links, Make Offer / Rate & Endorse |
| Employer | `employer-stipend-analytics-screen` | **New (Gap 1)** — market avg, histogram, competitor comparison table, AI suggestion |
| SuperAdmin | `superadmin-landing-screen` | Restricted login + 2FA notice |
| SuperAdmin | `superadmin-dashboard-screen` | Overview, pending approvals, manual account creation; sidebar links to Login Report & Ideas Triage |
| SuperAdmin | `superadmin-login-report-screen` | **New (Gap 4)** — user/role/login time/IP-device mock/success-fail table, date-range + role + status filters, export |
| SuperAdmin | `superadmin-messages-screen` | **New (Gap 6)** — read-only oversight inbox mirroring employer/candidate filters, with a "Flagged" filter |
| Viral/Share | `linkedin-mock-screen` | **Fixed** — single, complete mock LinkedIn compose window |
| Ideas | `feature-ideas-screen` | **New (Gap 5)** — status sidebar (Pending approval / Under consideration / Planned / In Development / Shipped / On Hold / Not Planning), topic filters (New Feature / Improvement / UI/UX / Integrations / Bug Report / Misc), voting, Submit Idea dialog. Shared by Candidate + Employer. |
| Ideas | `superadmin-feature-ideas-screen` | Same list, but SuperAdmin can change each idea's status |
| Offers | `employer-offer-screen` | Offer details form, offer-letter upload mock, automated email notice |
| Offers | `candidate-offer-chat-screen` | Candidate-side offer card in-chat with Accept/Decline + mock email triggers |
| Gaps | `mutual-rating-screen` | **New (Gap 2)** — employer↔candidate mutual star rating + skill endorsement + comments, blind until both submit |
| Gaps | `endorsement-certificate-screen` | **New (Gap 3)** — fully automatic endorsement certificate (role, period, skills endorsed, rating excerpt) with one-tap Share to LinkedIn / WhatsApp / mobile share sheet — **no screenshot upload**, system-generated text + link payload only |

## Other carried-over behaviors (from source file 6)

- Telegram + WhatsApp opt-in checkboxes (candidate profile, employer profile) and deep-link buttons once opted-in (communication screens).
- Mobile share-sheet mock (bottom-sheet style, app icon row) reused across referral, posting-share, and endorsement-share flows.
- Excel export mock buttons (candidate applications, employer posting stats/applicants, stipend analytics, login report).
- Searchable/anonymous candidate profiles with PII hidden until invite acceptance.
- Employer/candidate referral programs with unique links and LinkedIn/mobile share.
- Employer "show historical hiring numbers" trust toggle.

## Design system notes

The original wireframe class names (`wireframe-box`, `wireframe-input`, `wireframe-btn`, `wireframe-btn-outline`, `mock-captcha`, `screen`/`active`) were **kept** throughout the markup but their CSS definitions were replaced in `<style>` with production styling: white cards with `border-slate-200` + soft shadow + `rounded-xl`, indigo (`#4F46E5`) primary buttons, slate-bordered outline secondary buttons, and focus rings on inputs. Headings use **Outfit**, body text uses **Inter** (both via Google Fonts). The top navigator is a dark (`slate-900`) app-shell toolbar with grouped dropdown menus and an "Interactive Prototype / Wireframe" badge, plus a persistent amber disclaimer banner underneath it.
