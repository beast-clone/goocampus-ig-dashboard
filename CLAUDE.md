# GooCampus Marketing OS — project instructions

## MANDATORY: use the Hope UI theme for everything

This dashboard is built on the **Hope UI** design system — treat it as the brand book. **Every** new tab, page, panel, modal, or component you build MUST use these tokens and patterns. Never ship a generic/default-Tailwind look. If a design isn't clearly on-brand and sectioned, it's wrong — redo it.

All Version-2 UI lives under `app/(dashboard)/dashboard/hope-preview/` and renders inside `.hope-scope` (see `app/globals.css`). New V2 UI must stay in that scope.

### Brand tokens (from `.hope-scope` in `app/globals.css`)
- **Brand accent:** `#3A57E8` — use the Tailwind classes `bg-brand`, `text-brand`, `border-brand`, `bg-brand-light` (never hardcode a purple/indigo).
- **Brand dark:** `#2138B0` · **Brand light:** `#E9ECFB`
- **Headings / primary text:** `#232D42` (Tailwind: apply directly, `text-[#232D42]`)
- **Muted / secondary text:** `#8A92A6`
- **Page canvas behind cards:** `#F6F7FB` (light gray) so white cards read as sections
- **Cards / panels:** white surface, `border border-gray-100`, `rounded-xl` (12px), `rounded-2xl` for large containers. **No drop shadows** — `.hope-scope` strips them; use borders + the gray canvas for separation.
- **Font weights:** 400 and 500 only (headings are `font-medium`/`font-semibold`, never 700).

### Layout rules
- Break content into **labelled sections/cards** with a header (icon + title). Never dump text on a flat background.
- Establish hierarchy: highlight the most important thing (e.g. a brand-accented header bar `bg-brand-light`), keep secondary info in the sidebar/quieter.
- Use Tabler outline icons (`@tabler/icons-react`), the shared `HopeSelect` for dropdowns, and existing hope-preview components (`HopeDashboardShell`, `HopeSidebar`, `Panel`-style cards) rather than reinventing.
- Reference well-built examples already in the repo: the Marketing Hub Master-sheet views + detail modal (`marketing-hub/page.tsx`) and `my-day/HopeMyDay.tsx`.

## Backend / data
- Supabase writes go through the service client (`getSupabase()`), project **Beast Clone** `wlhbmzaernchwebapszq` (holds `mh_posts`, `mh_views`, `mh_attachments`, etc.). **Never touch Samvaya projects.**
- API routes are CSRF + session protected; test them from the page's own `fetch`, not curl.

## Workflow
- Work on branch `feat/hope-ui-reskin`. Verify changes live in the user's Chrome before saying they're done. No Netlify production deploy without explicit approval.
