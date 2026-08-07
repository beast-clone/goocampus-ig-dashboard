# Completeness gates — "missing fields → popup" audit

**Goal of the feature:** when someone tries to create / save / approve / submit / publish
content but required fields are missing (no creative, no caption, no SBU, no publishing
date, no collaborators, …), a **popup lists exactly what's missing** — instead of failing
silently, showing a vague one-line error, or just greying out a button with no reason.

**Status:** only **My Day** does this correctly today. Everywhere else that commits content
either fails silently, shows a generic error, or disables a control with no explanation.
This doc is the work list. Nothing here is built yet — it's a checklist to work through.

Audited: 2026-08-07 · Scope: `app/(dashboard)/dashboard/hope-preview/` (V2 UI) + `app/api/`.

---

## The server choke-point (only source of `missing[]`)

`app/api/marketing-hub/update/route.ts:119-146` is the single write route that emits
**HTTP 422 `{ error, missing: string[], gate }`**, on two transitions only:

- **`gate: "approve"`** (→ `Content - Approved`, lines 129-138) — requires: Content/brief
  (content OR caption), SBU, Priority, Publishing date, ≥1 collaborator.
- **`gate: "output"`** (→ `Output - Ready`, lines 141-146) — requires: a creative
  attachment OR an `output_link`.

Everything else is only enum-validated (400). `app/api/marketing-hub/create/route.ts`
does **not** gate — it only requires `title` (400 at line 49). So only status changes
through `/update` can produce a `missing[]`; for each surface the question is whether the
caller reads it. Reaching the "popup" behaviour on create / Ready-to-Publish requires
**adding server gates** for those transitions first.

Behaviour legend: **(a)** proper itemized popup · **(b)** generic error, ignores
`missing[]` · **(c)** client-side disable / inline only, no popup · **(d)** silent — nothing
shows.

---

## 🔴 P1 — Silent failures (nothing shows at all) — fix first

- [ ] **Marketing Hub → master-sheet status dropdown** — `marketing-hub/MarketingHub.tsx:2440`
  (via `save` 2405-2408 → `saveField` 1511-1522). `saveField` swallows the response body and
  returns a bare boolean; `save` does nothing on failure. Setting a row to `Content - Approved`
  / `Output - Ready` with missing fields → server 422 → **value silently snaps back, no toast,
  no popup.** Clearest gap: the gate exists but is invisible here. *(d)*
- [ ] **Content Studio → "Send to design"** — `content-studio/page.tsx:352-357` (`sendToDesign`).
  `if (res.ok) {…}` with **no `else`** — a failed `/api/marketing-hub/create` shows nothing. *(d)*
- [ ] Same swallow affects other master-sheet inline cells via `saveField` (publishing-date
  drag `MarketingHub.tsx:1216`, generic `2406`). *(d)*

## 🟠 P2 — Generic error, has `missing[]` but ignores it

The 422 body is already in hand; only `.error` is read. Change to read `.missing` and render
the shared popup.

- [ ] **Content Review → Push to Schedule / Send back** — `content-review/page.tsx:114`
  (`move()`), sets an inline banner from `d.error` only, ignores `d.missing`. *(b)*
- [ ] **Marketing Hub → detail-modal edits** — `saveOne` (`MarketingHub.tsx:2778-2785`) and
  `saveEdit` (`2852-2859`): `window.alert(j.error || "Could not save.")`, never reads
  `j.missing`. *(b)*
- [ ] Marketing Hub attachments/comments/views/columns alerts (`2828/2835/2888/2030/2141/
  2148/2158/2338`) — generic `window.alert`; low priority (not content-completeness). *(b)*

## 🟡 P3 — Disabled control only, no explanation (also needs a new server gate)

Button greyed with at most a tooltip; no list of what's missing. These transitions
(create, `Ready to Publish`) are **not gated server-side yet**, so this needs a server gate
+ the shared popup.

- [ ] **Content Review → Push to Schedule** disabled on `!hasCreative`
  (`content-review/page.tsx:152`) — inline amber chip only. `Ready to Publish` is ungated. *(c)*
- [ ] **Scheduler → enqueue/publish** — `canSubmit = caption && ≥1 media`
  (`scheduler/page.tsx:404`; button disabled `777`/`1176`); server error → inline banner
  (`475`), no itemization. *(c/b)*
- [ ] **Scheduler → LinkedIn composer** — `scheduler/LinkedInScheduler.tsx:54-77`: sequential
  inline `setMsg` guards ("Pick a page", "Add text/image", "Pick date/time", past-time), not a
  consolidated popup. *(b/c)*
- [ ] **Create-task modals** — shared `components/NewTaskModal.tsx` (requires only `title`,
  `goConfirm` 112-115) and My Day's `NewTaskModal` (`HopeMyDay.tsx:1023`, silent no-op on the
  disabled button). Neither validates SBU / date / collaborators nor shows a missing-fields
  popup. Create is ungated server-side. *(c)*

## ✅ Already correct — leave alone (this is the reusable pattern)

- **My Day → Approve gate** and **Output-Ready gate** — `HopeMyDay.tsx` handler at 1809-1812
  reads `res.status === 422 && j.missing` into `gateBlock`; modal at **3052-3078** maps every
  `gateBlock.missing[]` item into a bulleted list ("The brief isn't complete…" / "No creative
  to hand off…"), and reverts the optimistic move. *(a)* — **no change needed.**

---

## Recommended approach (roughly one pass)

1. **Lift** My Day's `gateBlock` modal (`HopeMyDay.tsx:3052-3078`) into a shared
   `<MissingFieldsModal missing={…} gate={…} />` component.
2. **Add server gates** in `marketing-hub/update` (and/or `create`) for the currently-ungated
   transitions that need them — `Ready to Publish`, and create — returning the same
   `422 { error, missing, gate }` shape.
3. **Every caller reads `missing[]`** on a 422 and renders the shared modal instead of a
   silent revert / `window.alert` / inline banner. This converts all of 🔴 🟠 🟡 at once.

Fix order: 🔴 P1 (silent → visible) → 🟠 P2 (already have the data) → 🟡 P3 (needs new gates).
