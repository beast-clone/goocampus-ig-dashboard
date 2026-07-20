# Add My Day loading skeleton, replace Content Review window.alert with branded feedback, and seed a unit-test baseline

- **Priority:** P2
- **Area:** shared

## Problem

Three polish/hardening gaps. (1) HopeMyDay.tsx declares `loading` (line 1061, set false at 1214) but never reads it in JSX, so on first mount the board flashes stat tiles as 0, empty task tabs and an empty 'Today's plan' until /api/my-day resolves — Content Review by contrast shows a proper 'Loading review queue…' state. (2) content-review/page.tsx reports failures with window.alert (line 92) — a blocking, unstyled OS dialog that contradicts the Hope UI brand and the toast pattern used in My Day — and confirms success silently (the approved card just vanishes with no positive feedback). (3) There is no test runner (package.json has no test script, no vitest/jest) and zero test files, yet the highest-risk logic (mh_status enum guard, owner-alias mapping, the tasks/pool split, hasCreative) keeps regressing across audit rounds — these are pure functions that unit tests pin cheaply with no DB.

## Files

- `app/(dashboard)/dashboard/hope-preview/my-day/HopeMyDay.tsx`
- `app/(dashboard)/dashboard/hope-preview/content-review/page.tsx`
- `package.json`

## Steps

1. MY DAY LOADING: In HopeMyDay.tsx, gate the initial board render on `loading`. Find where the board's main content returns JSX (the component whose state includes `loading` at line 1061). At the top of that return, add an early branch for the first load: `if (loading && tasks.length === 0) { return <div className="py-16 text-center text-sm text-[#8A92A6]">Loading your day…</div>; }` — match the Hope styling used by Content Review (content-review/page.tsx:133). Ensure this is inside the same scope where `loading` and `tasks` are in scope; do not gate on `loading` alone (that would flash on every poll) — the `tasks.length === 0` condition limits it to the genuine first load.
2. CONTENT REVIEW ERRORS: In content-review/page.tsx, the move() catch (line 91-93) currently calls `window.alert(...)`. Replace it with the existing branded error banner: change the catch body to `setErr(\`${label} failed: ${(e as Error).message}\`);`. The `err` state already renders a rose banner at lines 126-130, so this reuses the on-brand surface. Optionally auto-clear after a few seconds with a setTimeout, and clear `setErr(null)` at the start of move() so a prior error does not linger.
3. CONTENT REVIEW SUCCESS: Add lightweight positive feedback on a successful approve/send-back. Add a `const [flash, setFlash] = useState<string | null>(null);` state, set it in move() after `setPosts((p) => p.filter(...))` (e.g. `setFlash(\`${label} done\`); setTimeout(() => setFlash(null), 2500);`), and render it as a small green branded banner near the header (mirror the rose `err` banner styling but with emerald tones). Keep it minimal and on-brand (no shadows, rounded-lg, text-sm).
4. TEST BASELINE (optional but recommended, do last): add vitest. In package.json add devDependencies `"vitest": "^2.1.0"` and a script `"test": "vitest run"`. Run `npm install`. Because the guard logic currently lives inline in route handlers, extract the smallest pure helpers into a testable module: create lib/mh-guards.ts exporting (a) `isValidStatus(s: string)` backed by the same VALID_STATUS set as update/route.ts, (b) `normalizeOwner(v: string)` backed by OWNER_ALIASES, and (c) `isUnclaimedVideo(status, type, ownerKey)` matching my-day/route.ts. Then import these helpers in the routes (replacing the inline copies) AND in a new tests file lib/mh-guards.test.ts with cases: valid/invalid status, alias mapping ('manya b m' → 'manya', unknown passthrough), and isUnclaimedVideo true for approved video owned by writer / false when owned by an editor or non-video. Keep it request/response-shaping only — no live DB.
5. If the test-baseline step (4) is deferred, still land steps 1-3 as a standalone UX commit.

## Verification

Run `npx tsc --noEmit` — must pass. UX: throttle the network in Chrome and load My Day — a 'Loading your day…' state must show instead of an empty zeroed board, and must NOT reappear on subsequent background polls. In Content Review, force a failure (e.g. temporarily point the update fetch at a bad id) and confirm the rose banner shows instead of an OS alert; on a successful approve confirm the green success flash appears. Tests: `npm run test` must run vitest and pass the mh-guards cases.

## Risk

Low. The loading gate must include `tasks.length === 0` or it will flash on every poll. The test step touches route files by extracting helpers — verify the routes still behave identically after the extraction (the extracted sets must be byte-for-byte the same values). Adding vitest is dev-only and cannot affect the production build.
