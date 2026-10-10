# Domain: UI / UX (in-app + Gemini / mobile mocks)

## Responsibility

Restyle InternSafar pages **in place**; apply Gemini HTML / mobile handoffs; keep live behaviour (APIs, auth, Playwright IDs).

## Central sources

| Path | Role |
|------|------|
| `src/app/**` | Pages |
| `src/components/ip/**` | Product components + scoped `*-gemini.css` |
| `src/components/ui/**` | shadcn primitives |
| `src/app/globals.css` | Global styles (can fight mock utilities) |
| `.agents/skills/shadcn`, `frontend-design`, `tailwind-design-system`, `web-design-guidelines` | Mandatory UI skills |
| Workspace `gemini-tsx-handoff/` | HTML mocks (source of truth) + assets |
| Workspace `mobile csreens internsafar/` | Mobile HTML handoff; current phone-view reference = `FINAL_MOBILE_REFERENCE_UPDATED-2026-10-10/` (live as of 10 Oct, with live phone bugs listed) |
| Workspace `mobile-prompt-test/` | Mobile prompt experiments |
| Workspace `_local-backups-internship-portal/` | Compare/restore old UI only |
| Workspace rule `gemini-tsx-handoff.mdc` | Sibling-only + CSS override trap |

## Confirmed process for Gemini HTML drops

1. Map HTML → **IP** route(s). Placement Hub multiuser is out of scope unless the user says otherwise.
2. Leave the reference HTML where the user put it until the page is finished.
3. Report broken mock UI + live vs mock field gaps; **wait for Confirm** before coding.
4. Implement mock chrome in the **sibling** tree with scoped unlayered CSS when globals/shadcn override Tailwind.
5. After the user says the page is done, **move** (not copy) HTML into `gemini-tsx-handoff/mocks/` with a screen-specific name.

## Constraints

- Edit **sibling** app only; never nested mono IP.
- Prefer native inputs/buttons for Gemini chrome when shadcn/globals stomp classNames; Alert is OK for errors.
- Do not invent marketing claim copy from mocks (“X+ users”, fake stats).
- `AGENTS.md` UI quality block applies. `PRODUCT.md` / `DESIGN.md` are **missing** — use `AGENTS.md` + skills, do not invent those files unless asked.
- Deploy to Vercel only when the user asks, and only from the sibling folder.

## Shared shell + load-state patterns (inspected 2026-09-29)

- **Sidebar collapse (`PortalShell.jsx`):** one desktop control only — `sidebar-collapse-toggle` at the bottom of the sidebar (above the profile link), label "Collapse menu" + `Ctrl/⌘+B` hint; icon-only with tooltip when collapsed. Keyboard `Ctrl/⌘+B` toggles (ignored while typing in inputs). No collapse button in the top bar; mobile keeps the hamburger drawer. Native buttons in the shell need `border-0 bg-transparent` (no global button reset).
- **Sign out:** `handleSignOut` shows "Signing out…" + spinner and disables both sign-out buttons (`portal-sign-out`) immediately; `signOutAndEndSession` caps the session-DELETE call at 4s.
- **List/data pages load states** (Browse internships, Feature ideas `/ideas`, Employer analytics): use `fetchJsonWithRetry` + `fetchErrorMessage` (`src/lib/fetchJsonWithRetry.js`) with a latest-request guard. Show skeleton while loading (counts `…`), an error panel with **Try again** (no page reload) when the first load fails (counts `—`), a session-expired panel on 401, and keep stale data with a refresh notice on later failures. Distinguish true empty ("No ideas yet") from filtered empty ("No suggestions found"). Test IDs: `ideas-loading|ideas-load-error|ideas-retry|ideas-session-expired|ideas-empty-none|ideas-empty-filtered|ideas-refresh-error`, `analytics-loading|analytics-load-error|analytics-retry|analytics-session-expired`. Other tables have not all been audited for this pattern.

- **Simpler list pages (2026-10-09):** candidate dashboard / applications / notifications / referral, employer dashboard / postings / Find Candidates / notifications / referral, and both Messages inboxes (`MessagesSplitPane`) check `res.ok` and show `IpListError` (title + reason + **Try again**, `role="alert"`, test ID `ip-list-error`) instead of the empty state when the first load fails; later failures keep the stale list. SuperAdmin queue pages keep their own error box and add `IpRetryButton` ("Reload list"); SA Approvals titles list-load failures "Could not load Approvals" (was "Cannot complete this approval"). Both helpers live in `src/components/ip/IpListStatus.jsx` beside `IpListLoading` / `IpListEmpty`.

## Accessibility helpers (added 2026-10-09)

Use these instead of re-implementing per page:

| Need | Use |
|------|-----|
| Hand-built modal (`role="dialog"`) | `useOverlayDialog(open, onClose)` (`src/hooks/useOverlayDialog.js`) — returns a ref for the dialog box: moves focus in, traps Tab, Escape closes, focus returns to the opener. Give the box `aria-labelledby` |
| Toast / flash message | `IpToast` (single message) or `IpToastItem` (stacks) from `src/components/ip/IpToast.jsx` — owns the timer (6–12 s by length, paused on hover/focus), × button "Dismiss notification", always-mounted polite live region. Never add your own `setTimeout` to clear toast state. `ToastProvider` (`useToast`) uses the same item. Fixed toasts sit at `bottom: calc(5.25rem + env(safe-area-inset-bottom, 0px)); z-index: 10000` so the help-chat launcher (bottom-right, z 9999) never covers the × |
| Custom tab row (`role="tablist"`) | Children need `role="tab"` + `aria-selected`; add `onKeyDown={onTablistKeyDown}` (`src/lib/tablistKeys.js`) for Left/Right/Home/End with automatic activation |
| Browser tab title | Automatic: `RouteTitle` in `app/layout.js` sets `document.title` from `pageTitleFor(pathname)` (`src/lib/ipPageTitle.js`) — sidebar nav labels + an extra regex list for detail/auth pages, format "Label · InternSafar". New routes outside the nav need an entry there |
| Field labels | shadcn `Field` provides a label id via context; `Input` / `Textarea` inside a `Field` get `aria-labelledby` automatically unless they already have `id` / `aria-label` / `aria-labelledby`. Native inputs still need `<label htmlFor>` |
| Sortable table header | Put a `<button>` inside the `th` (keep `aria-sort` on the `th`) — see `.sac-sort-btn` in SA Candidates |
| Text colours on white | Muted text `#64748b` minimum (not `#94a3b8`); on `#f1f5f9` / `#eef2ff` tints use `#475569`. White text needs `#047857` green / `#b45309` amber or darker. `#94a3b8` stays OK for decorative icons, placeholders and disabled states |
| Tap targets | Adjacent icon buttons / chip × / small tabs at least 24×24 px (`min-height: 1.5rem`) |

## Related domains

Candidate / Employer / SuperAdmin / Auth pages being restyled.

## Inspect before modifying

Live page + handlers/IDs, mock HTML structure/control order, and any existing scoped CSS for that screen.
