# Internship Portal — Requirements Document (Draft)

**Status:** Draft from stakeholder prompts + wireframe consolidation (2026-08-08)  
**Prototype:** `combined.html` (clickable UI only)  
**Sources merged:** `internship_portal_wireframes (6).html` + `internship_incremental_only.html`  
**Out of scope for prototype:** Real Google OAuth keys, SMTP, WhatsApp/Telegram APIs, LinkedIn API, Excel generation, production DB

---

## 1. Product positioning

- Internship portal related to Placement Hub (job portal), but **smaller in features**.
- Separate module conceptually (not tightly coupled to Placement Hub tables).
- College is an **attribute on candidate**, not a college-admin role in this product.
- Goal: hiring + virality (referrals, LinkedIn share, points).

### Extent (prototype vs production)

| Layer | What exists now | What production needs later |
|---|---|---|
| UI flows | `combined.html` screens | Next.js app (separate from this folder) |
| Candidate Google Auth | Mock “Continue with Google” | Real Google Cloud OAuth Client ID + Secret |
| Passwords / emails | Alerts / copy only | Transactional email (password, offers, hire confirm) |
| WhatsApp / Telegram | Opt-in UI + deep-link mocks | Provider integration after opt-in |
| LinkedIn share | Mock composer / share sheet | System-generated share text + URL (Open Graph); LinkedIn share intent |
| Endorsements | Auto-generated certificate screen | Persist certificate record; no screenshot upload |
| Feature Ideas | Copied pattern from Placement Hub | APIs + votes + SuperAdmin triage |
| Login Report | Table mock | Audit log of auth events |

---

## 2. Roles

1. **Candidate (Student)** — find/apply to internships, messaging, offers, ratings, referrals, ideas.
2. **Employer** — register/verify, post, search/invite, message, offer, hire, analytics, referrals, ideas.
3. **SuperAdmin** — approve / create employers, messages oversight, login report, feature-ideas triage, notifications.

---

## 3. Authentication & registration

### 3.1 Landing / Login

- Combined landing: **Login** OR navigate to **Register**.
- Login: email + password + **CAPTCHA**.
- Link to **Forgot password** → reset screen (email + CAPTCHA).
- Optional: “Login with Google” for candidates (same Google identity as register).
- After login: if profile incomplete → force **profile** before applying / posting.

### 3.2 Candidate registration

- **Google OAuth only** (no Yahoo / free-mail self-serve registration path).
- Candidate does not fill a long registration form; Google supplies identity.
- On success: system **emails a temporary password**; candidate can **change password** after login.
- *(Production constraint: requires Google Cloud project + OAuth Client ID/Secret. No alternative to OAuth for real Google Sign-In.)*
- Domain / “no Gmail” rules, if required later, are **post-OAuth allowlists** in app logic — clarify with stakeholder before implement.

### 3.3 Employer registration

- Provide **company website** + **work email** with **matching domain**.
- On success: **password emailed**.
- If domain email not available / mismatch: submit **manual request form** → SuperAdmin creates account.
- After login: **change password**; **complete company profile** before posting.

### 3.4 SuperAdmin login

- Separate SuperAdmin landing (restricted).
- Prefer 2FA / OTP note (wireframe).
- **Login Report:** user, role, timestamp, device/IP mock, success/fail; filterable; exportable.

---

## 4. Profiles

### 4.1 Candidate profile (required before apply)

Basic attributes (expandable):

- Photo (profile picture)
- Full name, college, degree, specialisation/branch, graduation year / studying vs graduated
- City, state (residence), preferred work mode (WFH / WFO / hybrid)
- Grade/CGPA (or equivalent)
- Skills, bio
- Links: LinkedIn, GitHub, portfolio, other
- CV upload (shown only after connection rules allow — not on public searchable card)
- Messaging prefs: **WhatsApp opt-in**, **Telegram opt-in** (mobile revealed only after message delivery / connection rules)
- Privacy: **profile searchable** (without phone, email, CV) for employer discovery
- Opt-in: show **completed internships** (and ratings/endorsements) to all employers
- Default **points** granted at account creation

### 4.2 Employer profile (required before post)

- Company name, logo upload
- Website, industry, size, locations
- About / culture
- Documents (optional): Shop Act, LLP registration, Business PAN
- Trust: **show identity on postings**; **show hiring numbers** to applicants (opt-in)
- Messaging: WhatsApp / Telegram opt-in
- Referral link + points / free posting credits
- Default **points** at account creation

---

## 5. Postings & eligibility

### 5.1 Internship posting

- Title, description, skills, stipend, location, WFH/WFO
- **Start date**, **end date** and/or **duration in months**
- Basic **application questions**
- Eligibility criteria (scoring + filter aids — **does not block apply**):
  - Degree, grade, location, WFH vs WFO, specialisation
  - Graduated vs studying, city, residence (state/city)
  - Additional criteria as product grows (skills match, year of study, etc.)
- Employer mobile: **share** posting (WhatsApp, LinkedIn, etc.)

### 5.2 Candidate browse / filter

- Filter by eligibility fields **and stipend**
- Show eligibility **match score** (advisory)
- Apply still allowed if score low (unless business later changes this)

---

## 6. Applications, messaging, hire, offers

### 6.1 Messaging (Candidate, Employer, SuperAdmin)

- Inbox with filters: **unread**, **posting**, **date range**, **pending reply** (+ SuperAdmin **flagged**)
- Sort options (newest, oldest, unread first, etc.)
- WhatsApp / Telegram deep links when recipient opted in (mobile-friendly)

### 6.2 Confirm hiring

- Employer can **confirm hiring** in portal → **email to candidate** (and employer copy as needed)

### 6.3 Formal offers (platform)

- Employer: create offer (role, stipend, start date, valid until), **upload offer letter**, optional message
- Triggers emails to **candidate + employer**
- Candidate: view offer in inbox/chat card → **Accept** or **Decline** on platform
- Accept triggers emails to both; status → Hired / Accepted
- Candidate can **share offer** on LinkedIn when on mobile (mock share sheet)

---

## 7. Points & virality

- Default points on account create
- Unique referral links (dummy in wireframe)
- Registration via referral carries referrer identity → referrer earns points
- Employer points → **free postings**
- Candidate points → **more applications permitted**
- Referral + LinkedIn post mocks to encourage sharing

---

## 8. Talent search & transparency

- Candidate opt-in: searchable profile **without** number, email, CV
- Employer search + **invite to apply**
- Employer opt-in: show **hiring numbers** to candidates who applied
- Candidate opt-in: show **completed internships** to employers
- Employer / candidate **Excel export** (applications, postings, analytics subsets)

---

## 9. Ratings, endorsements (Upwork-like; Cal.id-style automation)

### 9.1 Mutual ratings

- After internship **completion**, employer rates candidate and candidate rates employer
- Stars + comments; optionally blind until both submit

### 9.2 Endorsements — system automatic (no manual screenshots)

Inspired by [Cal.id](https://cal.id/) automation principles (confirmations/follow-ups fire without manual ops):

1. Internship marked **Complete** (or offer accepted + completion confirmed).
2. Platform **auto-generates endorsement certificate**: role, company, period, skills endorsed, rating excerpt, public share URL.
3. **No** upload of LinkedIn screenshots / manual image proof workflows.
4. Candidate and employer get one-tap **Share to LinkedIn / WhatsApp / native mobile share** with system text + link.
5. Certificate remains available on profiles when visibility opts allow.

---

## 10. Analytics & AI (employer)

- Dashboard AI insights teaser
- **Stipend analytics:** market average, distribution/histogram, competitiveness vs own posting, AI suggestion copy
- College / degree / applicant availability / historical application volume analytics
- Reports + export

---

## 11. SuperAdmin

- Approve employer accounts
- Create employer accounts from manual forms
- Dashboard (counts, pending actions, notifications)
- Messages oversight
- **Login report**
- Feature Ideas triage (status changes)
- Notifications section

---

## 12. Feature Ideas / Suggestions (from Placement Hub)

Port the Placement Hub **Feature Ideas** module:

- Submit idea (title, description, topics)
- Topics: New Feature, Improvement, UI/UX, Integrations, Bug Report, Misc
- Statuses: Pending approval, Under consideration, Planned, In Development, Shipped, On Hold, Not Planning
- Vote, search, sort (trending / newest / etc.)
- Candidate + Employer can submit/vote; SuperAdmin triages status

*(Optional later: also port “AI profile suggestions” patterns from student profile — secondary to Feature Ideas board.)*

---

## 13. Notifications

- SuperAdmin, Candidate, Employer each have a **notifications** area
- Examples: approvals, applications, offers, endorsement share, account request, hire confirm

---

## 14. Suggested extras (ChatGPT-style expansion — not yet committed)

Use these as discussion prompts with stakeholders / ChatGPT for next round:

1. Application stages pipeline (Applied → Reviewed → Interview → Offered → Hired) with SLA timers  
2. Interview scheduling (Cal.id-like booking link embedded in message thread)  
3. Skill assessments / take-home task attachment on posting  
4. Fraud / duplicate employer detection on domain + GST/PAN  
5. College verification badges for `.edu` / `.ac.in` Workspace Google accounts  
6. Bulk invite candidates from search results  
7. Saved searches + email digests for candidates  
8. Dispute / mediation ticket between employer & candidate  
9. Public company pages + verified badge after docs reviewed  
10. Accessibility audit + keyboard-first messaging  
11. Audit trail export for SuperAdmin (beyond login report)  
12. Points ledger (earn/spend history)  
13. Soft-block apply only below X eligibility score (policy toggle)  
14. Multi-language (EN + regional)  
15. Dark mode  
16. Mobile PWA install for share/WhatsApp flows  

**Prompt you can paste into ChatGPT:**  
> “Given the Internship Portal requirements in REQUIREMENTS.md sections 1–13, propose 20 additional features that increase virality and hire conversion without becoming a full job board. Rank by effort vs impact. Flag anything that conflicts with Google-OAuth-only candidate registration or eligibility-as-score-not-hard-block.”

---

## 15. Open decisions (need stakeholder answer)

1. Candidate Google Auth: allow `@gmail.com` Workspace-only college domains, or both?  
2. Exact default points / conversion to free posts / application caps?  
3. When is mobile/email revealed after WhatsApp/Telegram opt-in?  
4. Is eligibility ever a hard block, or always advisory?  
5. Who owns the production Google Cloud OAuth project (company vs temporary demo keys)?  

---

## 16. Prototype inventory

See `README.md` for the **26 screens** in `combined.html` and how they map to the gaps (stipend analytics, mutual rating, automatic endorsements, login report, feature ideas, multi-role messages, offers).
