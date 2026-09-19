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
| Workspace `mobile csreens internsafar/` | Mobile HTML handoff |
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

## Related domains

Candidate / Employer / SuperAdmin / Auth pages being restyled.

## Inspect before modifying

Live page + handlers/IDs, mock HTML structure/control order, and any existing scoped CSS for that screen.
