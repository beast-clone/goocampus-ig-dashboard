# Layout audit against the Scheduler spec — 18 Sep 2026

Every page in the sidebar was opened in Chrome and measured with the same script.
Nothing was changed; this is the list to decide from.

**58 pages audited.** (The sidebar lists 59 links; `/dashboard/preview/instagram`
is a 404 — Instagram in the sidebar is a folder with no page of its own.)

---

## The reference — measured in the Scheduler composer ("+ Create post")

This is the screen that was built against Meta Business Suite's own measurements.

| Aspect | Value |
|---|---|
| Title | 20px / 700 / line 24 |
| Section (card) title | 16px / 700 / line 20 |
| Helper text | 12px / 400 / line 16 |
| Body | 14px |
| Type scale | 12 / 14 / 16 / 20 — nothing else |
| Smallest text | 12px |
| Card padding | 16px |
| Card corners | 4px |
| Gap between cards | 16px |
| Field height | 36px |
| Button height | 36px, label 14px / 500 |
| Form column | 600px |
| Page column | 1440px |

One inconsistency inside the reference itself: **"Save as draft" is 38px tall
next to a 36px "Publish".**

The spec has no size for KPI figures (big numbers on stat cards), because the
composer has none. Those were measured separately, see *Decisions* below.

---

## What already matches everywhere

- **Corners: 4px on every card on all 58 pages.** No failures.
- **Page column: 1440px** on every page except My Day, which is full-width by
  design (the `.hmd` exemption from September).
- **In the reskin (`.preview-scope`):** every page.

---

## Three shared components cause most of the failures

These sit on roughly 45 pages each. Fixing the component fixes every page at once.

| # | Component | Measured | Spec | Pages |
|---|---|---|---|---|
| 1 | Blue banner title (`.preview-hero-h1`, `text-[1.7rem]`) | **27.2px** / 700 | 20px / 700 | ~45 |
| 2 | Date-range toolbar card under the banner | padding **12px** | 16px | ~45 |
| 3 | Date pills in that toolbar (7d / 30d / 90d / 6m / 1y / Custom) | **30px** tall | 36px | ~45 |

Pages **without** the banner: Team Command, Publishing Calendar, AI planner, and
all eight Sales Hub sub-pages. The Sales Hub sub-pages are the **only pages whose
page title already matches the spec (20px / 700).**

Overview's banner title is bigger again — **32px** ("Good morning, …").

---

## Page by page

Legend — **✅ Close:** only the three shared deviations above.
**🟡 Drift:** spacing or sizes off the spec, readable but inconsistent.
**🔴 Problem:** illegible text, or several competing sizes on one page.

Every page also carries the three shared deviations unless it's marked as
having no banner; they aren't repeated per row.

### Home & workspace

| Page | Verdict | Page-specific findings |
|---|---|---|
| Overview | 🔴 | Title 32px. KPI numbers in **five** sizes (19, 20, 23, 24, 26). Section titles 16/600 and 20/600 instead of 16/700. KPI cards padded 12px, gaps 12px. Buttons in five heights (32, 37, 38, 39, 46). |
| Team Command | 🟡 | No banner. Page title **18.4px / 600** — off the scale. Buttons 41px. |
| My Workspace → Briefing | 🟡 | Section titles 16/600 (×6). Gaps 12px and 24px. Buttons 39px. |
| My Day | 🟡 | Heading **17.6px** (off scale). Fields 37px. Buttons in seven heights (26–37). Full width by design. |
| Workload | 🟡 | Section titles 16/600. Gaps 12px. |
| Attendance | 🟡 | Heading **22px**. Cards padded 12px, gaps 12px. One field 30px. |
| Master sheet | 🟡 | Avatar initials 8px (declared exception). Toolbar buttons 33px (×17). |
| Pipeline | ✅ | Column counts at 24px. |
| Content calendar | 🔴 | **62 pieces of text under 12px** (10.6, 10.9, 11.8px), plus 12.2, 12.5, 12.8, 14.5, 18.4, 21.6px. The calendar uses its own stylesheet, which the type scale can't reach. |

### Content

| Page | Verdict | Page-specific findings |
|---|---|---|
| Content Radar | 🟡 | Field 34px. Buttons in nine heights (18–43). |
| Content Studio | 🟡 | Cards padded 12px (×6). Gaps 10px. Field 35px. |
| Publishing Calendar | 🔴 | **52 pieces of text under 12px** — day numbers 11.84px (×42), weekday headers and filter labels 10.56px. Custom `hcal-*` classes, outside the scale. Headings 18.4 and 21.6px. |
| AI planner | 🟡 | No page title at all. Two cards padded 4px. |
| Content Review | ✅ | — |

### Scheduler

| Page | Verdict | Page-specific findings |
|---|---|---|
| Scheduler (landing) | 🟡 | The four KPI tiles padded 10px. One 8px gap. Empty preview panel padded 40px. KPI numbers 21px. **The Scheduler's own landing page doesn't meet its composer's spec.** |
| Published | 🔴 | **60 account handles at 8px** — the `@goocampus` strip under every thumbnail in the month grid. Illegible. |
| Top performers | 🟡 | Cards padded 4px and 48px. |

### Instagram

| Page | Verdict | Page-specific findings |
|---|---|---|
| Posts | ✅ | KPI numbers 20 and 24px. |
| Reels | 🟡 | One 18px text. One 24px gap. KPI 18px. |
| Stories | 🟡 | A 27.2px heading inside the page. KPI 27.2px. |

### LinkedIn

| Page | Verdict | Page-specific findings |
|---|---|---|
| LinkedIn | 🟡 | "Carousel" badges on thumbnails at 9px (×16) — declared exception. KPI 18 and 20px. |
| LinkedIn → Posts | 🟡 | Section title 16/600. Post cards padded 12px, gaps 12px (×21). KPI 18px. |

### YouTube

| Page | Verdict | Page-specific findings |
|---|---|---|
| YouTube | ✅ | One card padded 4px. |
| Long-form | 🟡 | Section title 16/600. Cards padded 12px and 6px. Gaps 12px. KPI 24px. |
| Shorts | 🟡 | Same as Long-form — same component. |

### Facebook

| Page | Verdict | Page-specific findings |
|---|---|---|
| Facebook | 🟡 | Cards padded 12px (×5). Gaps 12px (×14). |
| Facebook → Posts | 🟡 | Section title 16/600. 18px text. Cards padded 12px, gaps 12px (×23). |

### Website

| Page | Verdict | Page-specific findings |
|---|---|---|
| Website | 🟡 | Heading **24px / 600**. Cards padded 12px (×7), gaps 12px. |
| Search Console | 🟡 | Cards padded 8px and 12px. Gaps 12px. |
| Clarity | 🟡 | 24px text. Cards padded 12px (×13) and 32px. Gaps 12px (×10). |
| Bing | 🟡 | Cards padded 12px. Gaps 12px. |
| SEO | 🟡 | One 24px gap. KPI 22px. |

### Audience & Ads

| Page | Verdict | Page-specific findings |
|---|---|---|
| All platforms | 🟡 | Section titles 16/600 (×12). Cards padded 6, 8 and 12px. Gaps 12 and 20px. |
| Ads | 🟡 | KPI numbers in **four** sizes (20, 24, 27.2, 30). One button 18px tall. |
| Competitor Ads | ✅ | Filter buttons 24px (×9). |
| Competitors | 🟡 | 14.5px text. Field 32px. Gaps 12px. |
| Marketing Campaigns | ✅ | — |

### Inbox & Sales

| Page | Verdict | Page-specific findings |
|---|---|---|
| Inbox | 🟡 | Heading **19px**. Card padded 8px. Gap 20px. Field 35px. Buttons 41px. |
| Social Leads | 🔴 | Text at 11.8, 12.5, 13.8 and 14.7px — fractional sizes from inline/em sizing, outside the scale. |
| Sales Hub | 🔴 | Big numbers at 24, 30 and 36px. Gaps 20px (×8). Card padded 10px. Field 33px. Buttons 28px (×14). |
| → Search leads | 🟡 | Fields 38 and 35px. Row buttons 30 / 34 / 40px. |
| → Per day | 🔴 | **11.5px text (×7).** One 46px number. |
| → By interest | ✅ | One card padded 8px. |
| → Counsellors | 🟡 | 14.5px text (×4). |
| → Leads tracker | ✅ | — |
| → Unassigned leads | 🟡 | Fields 38px. Row buttons 30 / 34 / 40px. |
| → Transfer | ✅ | — |
| → Roles | ✅ | — |
| Organic Sales | 🔴 | **11px text (×6).** Buttons 42px. KPI 19 and 24px. |

### AI, reports & admin

| Page | Verdict | Page-specific findings |
|---|---|---|
| Ask GooCampus | 🟡 | 14.5px text. Card padded 10px. Field 35px. |
| AI Insights | ✅ | — |
| Reports | 🟡 | Cards padded 14px (×6) and 32px. Gaps 36px. KPI 22px. |
| Social Media Reports | ✅ | Buttons 38px. |
| Recycle Bin | 🟡 | 14.5px text. Empty-state card padded 56px. |
| Integrations | 🟡 | Section titles 16/600 (×7). KPI 20 and 26px. |
| Diagnostics | 🟡 | Gaps 14px. |
| Tools | ✅ | — |
| Team | 🟡 | **15 buttons only 18px tall.** Fields 37px. |

---

## Totals

| Verdict | Pages |
|---|---|
| ✅ Close (only the shared deviations) | **13** — Pipeline, Content Review, Posts, YouTube, Competitor Ads, Marketing Campaigns, By interest, Leads tracker, Transfer, Roles, AI Insights, Social Media Reports, Tools |
| 🟡 Drift | **37** |
| 🔴 Problem | **8** — Overview, Content calendar, Publishing Calendar, Published, Social Leads, Sales Hub, Per day, Organic Sales |

---

## Patterns across pages

1. **Section titles at 16/600 instead of 16/700** — Overview, Briefing, Workload,
   LinkedIn Posts, Long-form, Shorts, Facebook Posts, All platforms, Integrations.
   The existing weight rule in `globals.css` only fires when the heading also
   carries the `text-[#232D42]` colour class; these don't.
2. **Cards padded 12px and gaps of 12px** (`p-3`, `gap-3`) — on ~20 pages. This is
   the Overview `p-3` question from yesterday, and it turns out to be dashboard-wide.
3. **Off-scale headings** — 17.6, 18.4, 19, 21.6, 22, 24px across seven pages.
4. **Text under 12px** — six pages, 188 pieces of text in all (not counting the
   declared exceptions: LinkedIn's 9px "Carousel" badges and Master sheet's 8px
   avatar initials). The worst three (Published, Publishing Calendar, Content
   calendar) come from stylesheets the Tailwind-keyed type scale can't see.
5. **Button heights** — 16 different heights across the dashboard (18 to 46px),
   against a spec of 36px.
6. **Field heights** — 30, 32, 33, 34, 35, 37 and 38px against 36px.

---

## Decisions needed before building

1. **The blue banner.** Its title is 27.2px against a 20px spec, and Business
   Suite has no hero banners at all. Shrink the title to 20px and keep the
   banner, or retire the banner for a plain 20px title the way the Sales Hub
   sub-pages already do?
2. **Compact controls.** The reference only defines a 36px full-size button.
   Date pills, row actions and filter chips need a second, smaller standard. I can
   measure what Business Suite uses for its compact controls rather than pick one.
3. **KPI figures** appear in 12 different sizes across the dashboard (18, 19, 20,
   21, 21.6, 22, 23, 24, 26, 27.2, 30, 46px). They need one size.
4. **12px card padding and gaps** — bring to 16px everywhere, or keep a compact
   variant for dense grids like post thumbnails?

---

## Method, and its limits

- Measured at your Chrome window width (2133 CSS px, 90% zoom — zoom doesn't
  change CSS measurements).
- Pages were measured as they render with today's data. An empty page may lay out
  differently once it has content.
- Open modals were excluded, except the composer used as the reference.
- "Section title" means bold text 15–24px under 60 characters; "KPI figure" means
  numeric text 18px and up. Both are heuristics and could miss or misfile a few
  elements, but the counts line up with what's on screen.
