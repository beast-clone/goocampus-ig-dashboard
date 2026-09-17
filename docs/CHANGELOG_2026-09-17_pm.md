# Changelog — 17 Sep 2026, afternoon session

Branch **`feat/dashboard-reskin`**, HEAD **`56d4e27`**, tree clean, everything pushed.
**Nothing is deployed to Netlify.** 17 commits, all on top of `bba1aec`.

Picking up from the morning handoff (`docs/HANDOFF_2026-09-17.md`), which is still
accurate except that its open item 4 (card padding) is now done.

---

## Start here if you're resuming

```bash
cd "<repo>"
npm run dev            # capped at 1536MB heap; the machine is 8GB and tight
```

Then open **http://localhost:3000/dashboard/preview**. You have to be signed in —
`middleware.ts` bounces every `/dashboard` path outside `/dashboard/preview` to the
preview route, so V1 URLs never render.

Before any commit: `find app components -name "._*" -delete`
(the exFAT drive writes AppleDouble files; one inside an API folder is treated as a route).

---

## What changed

### 1. The Marketing Hub task modal is now a 1:1 copy of Airtable's expanded record

This took several passes and the last one is the only one that matters. Measured
against the real record (`recPKaKhZDUPUnFwg` in the Content Calendar base), not
approximated:

| | Airtable | Ours |
|---|---|---|
| card | 1104 × 829 | 1104 × 829 |
| font | `-apple-system` | `-apple-system` |
| title | 23px / **weight 400** / lh 32 | same |
| field label | 13px / 400, grey | same |
| label column | x 94px, 174px wide | x 96px, 174px wide |
| label icon | 16px `#616670` | same |
| activity pane | 287px, right | same |

**The thing worth remembering:** Airtable's record title is **not bold**. Its
hierarchy comes from size alone, 23 against 13. Every failed attempt of mine tried
to fix the hierarchy by making headings *louder*, which was the wrong direction.

The structure changed too. Airtable lays a record out as one column of field rows —
label left, value beside it — with the activity feed alone on the right. Ours had
four fields on the left and everything else stacked in a right-hand column, so
Status / Owner / Priority were never on the same grid as Creatives / Caption. The
"Details" grouping is gone; each of its rows is now a field row like any other.

13px and 23px are **not** on the dashboard's 12/14/16/20 scale. Rather than bend
that scale for every tab, the modal opts out by name via `.hub-airtable` in
`globals.css`. That class appears in exactly one place in the codebase.

Files: `preview/marketing-hub/MarketingHub.tsx`, `app/globals.css`.

### 2. Sub-floor text brought up to the 12px floor — dashboard-wide

The density pass claims a 12px floor, but its selectors are a prefix allowlist
starting at `text-[10`, so anything smaller was invisible to it and rendered raw.

- **9px / 9.5px stat labels → 12px** — 43 labels across 20 files. These are the
  ones on Reels, LinkedIn → Posts and Facebook → Posts (`Avg Views`, `Engagement
  Rate`, `Impr.`, `React.`, `Comm.`). Several were *abbreviated to survive 9px*;
  the abbreviations were left alone, only the size moved.
- **Table headers 11.2px → 12px** — `font-size: 0.7rem` in `globals.css` predated
  the scale and undercut its own floor on every table.

Only the uppercase label idiom was lifted. Avatar initials (11), month-view
calendar chips (3) and thumbnail overlay badges (7) stay small on purpose — each
is small because its container is small.

### 3. Card padding normalised — closes the last handoff item

Type, corners and field heights went dashboard-wide in September; padding never
did, because a blunt rule on `p-5`/`p-6` would have caught things that aren't cards.

It didn't have to be blunt. Of 197 elements carrying `p-5`/`p-6`, 87 are the card
idiom — `bg-white` + `border-gray-100`. Keying on that **shape** rather than on the
padding class leaves the other 110 alone (85 wrappers/grids/tinted panels/empty
states, 12 modal backdrops). 16px is Business Suite's own figure.

Measured: Sales Hub 15 cards 20→16, LinkedIn 7, SEO 6.

**Gotcha found the hard way:** Tailwind emits `md:p-5` as its own class, so `.p-5`
never matched a card written `p-4 md:p-5`. Six SEO cards sat at 20px after the
first rule landed. Found by walking every tab and measuring instead of trusting the
rule to have worked. `md:p-5` / `md:p-6` are now covered too.

Left alone on purpose: modal dialog panels (`shadow-xl`, no gray-100 border),
amber/emerald notice cards (alerts — the room is doing work), and Overview's `p-3`
cards (compact by design; raising those is a separate decision).

### 4. Publishing Calendar was never in the reskin at all

`previewScopeOnPage: 0` — the page had no `.preview-scope` element anywhere, so
**none** of the reskin reached it: no type scale, no 4px corners, no 34px fields,
no 1440px column, not the new card padding either. Every other tab wraps itself;
this one was missed, the same way My Day and Team Command were before September.

After wrapping: corners 4px, type collapsed to 12px ×45 / 14px ×4, cards at 16px,
nothing under 12px.

### 5. The AI planner opened on the wrong month

`PostPlanner.tsx` defaulted to the month of the **earliest** card, so one stale post
dragged the whole view back — a single card left on 28 Jul had the planner opening
on July in the middle of September, which read as a broken calendar.

It now opens on the current month whenever anything is planned from today onward,
and falls back to the earliest card only when everything planned is in the past
(better to land on the work than on an empty month).

**This is why it still shows July today:** the planner has exactly one card and
it's dated 28 Jul 2026, so the fallback is doing its job. That tab looks empty
because of the data, not the layout.

### 6. The planner's two columns didn't line up

The helper line and the month nav sat *inside* the calendar column, so the calendar
card began 79px below the detail card beside it. Both belong to the page, so they
moved above the row. (That branch rendered the row as its only child, so the
siblings needed a fragment — two attempts broke the build before I spotted it.)

After: calendar card left 351 / top 229 / right 1415, detail card left 1431 / top
229 / right 1791. Gutter 16px, total 1440px, tops aligned.

### 7. V1 marketing hub deleted, and its deep links repointed

`app/(dashboard)/dashboard/marketing-hub/page.tsx` had not been served to anyone
since 2026-07-18 (middleware retires V1). Deleted. Nothing imported it; the sidebar
and shared components reach the live tab through `toV2Href`.

Two places still built URLs on that dead path, and **both were already broken** —
the redirect rewrites only the path, to `/dashboard/preview` (Overview), so
`?open=<id>` arrived somewhere with no handler for it:

- `PreviewMyDay.tsx:3067` — the task title in My Day's approvals list
- `lib/date-approvals.ts:41` — **the task link inside outgoing approval emails**

Both now use `/dashboard/preview/marketing-hub?open=<id>`. Proved with a real id:
old URL → Overview, no modal; new URL → the modal open on the right task.

> Emails already sent still carry the old link. The fix only takes effect on the
> next deploy.

### 8. Alignment swept across the whole dashboard

37 tabs measured live for the same two-column fault. **One real fault (the planner,
fixed), one false positive (Scheduler — its right-hand control row sits exactly
level with the left column's first row).** Everything else clean.

The check was validated before being trusted: the 79px offset was re-injected into
the planner, confirmed caught, then removed and confirmed clear.

---

## Still open

Carried over from the morning handoff, still untouched:

1. **Press the September Airtable import** — 166 records, 161 new. Master sheet → Sync from Airtable.
2. **Publish one real story** — the n8n path is still untested end to end.
3. **Prove the copyright amber branch** with a file Meta genuinely flags.
4. Facebook's copyright fields stay empty outside a reel upload session; our token can't open one.

New, and needing your decision:

5. **`text-lg` — 100 instances at 18px** that the type scale never touches; 65 are
   non-stat. It's the last thing outside the scale that isn't a deliberate
   exception. Folding it into 16px or 20px needs a call, because it's currently
   used for both section headings and page titles.
6. **Overview's `p-3` cards at 12px** — below the 16px standard but compact by
   design. Raising them is a separate decision.
7. **The modal now uses Airtable's type system, the rest of the dashboard uses
   Meta's.** Deliberate, and scoped so it can't leak, but it is a divergence.

---

## Things that will bite you

- **`git push origin main` is a silent no-op.** Work is on `feat/dashboard-reskin`.
- **`find app components -name "._*" -delete` before every commit.** 138 of them
  existed at the start of this session.
- **Tailwind responsive variants are separate classes.** `.p-5` does not match
  `md:p-5`. This cost six SEO cards; assume it applies to any class-keyed CSS rule.
- **`.preview-scope` sits on modal backdrops too**, which is why the card padding
  rule and the 1440px width cap both need `:not(.fixed)`.
- **A tab can be outside `.preview-scope` entirely** and look broken for that reason
  alone. Publishing Calendar was, until today. Worth checking first when a tab
  "doesn't match" — `document.querySelectorAll('.preview-scope').length` in the
  console answers it in one line.
- The three biggest files are still the ones under active edit: PreviewMyDay,
  MarketingHub, scheduler/page.
