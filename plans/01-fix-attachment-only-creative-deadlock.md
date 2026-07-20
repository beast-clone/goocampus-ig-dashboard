# Fix attachment-only creative deadlock in Content Review and To-Schedule gates

- **Priority:** P0
- **Area:** content-review

## Problem

Both gate routes decide whether a post has a schedulable creative using ONLY mh_posts.media_urls / output_link. But creatives uploaded through the My Day / Marketing Hub task-detail modal POST to /api/marketing-hub/attach, which writes ONLY to mh_attachments with kind='creative' (confirmed: attach/route.ts:23 defaults kind to 'creative'; media_urls is never touched). So a genuinely-ready post whose only creative is an attachment reports hasCreative=false: in Content Review the 'Push to Schedule' button is disabled (content-review/page.tsx:208 disabled={busy || !p.hasCreative}), and even if forced past, scheduler/to-schedule/route.ts:49 filters it out. Because Content Review is the ONLY gate into the Scheduler, such a post is permanently stuck. The my-day GET route already does the correct second query on mh_attachments (my-day/route.ts:135-151); these two routes do not.

## Files

- `app/api/content-review/route.ts`
- `app/api/scheduler/to-schedule/route.ts`
- `app/api/marketing-hub/attach/route.ts`

## Steps

1. Open app/api/marketing-hub/attach/route.ts and confirm the attachment kind for uploaded creatives is the string 'creative' (line ~23: `const kind = form.get('kind') === 'reference' ? 'reference' : 'creative'`). Use exactly that literal in the queries below.
2. In app/api/content-review/route.ts, immediately after the existing `if (error) throw new Error(error.message);` (line 30) and BEFORE the `const posts = (data || []).map(...)` block, add: `const ids = (data || []).map((r) => r.id);` then `const attSet = new Set<string>();` then `if (ids.length) { const { data: atts } = await sb.from('mh_attachments').select('post_id').in('post_id', ids).eq('kind', 'creative'); (atts || []).forEach((a: { post_id: string }) => attSet.add(a.post_id)); }`.
3. In the same file change the hasCreative expression (currently line 48 `hasCreative: media.length > 0 || !!r.output_link,`) to `hasCreative: media.length > 0 || !!r.output_link || attSet.has(r.id),`.
4. In app/api/scheduler/to-schedule/route.ts, after `if (error) throw new Error(error.message);` (line 43) and BEFORE the `const posts = (data || [])` chain, add the same attachment lookup: `const ids = (data || []).map((r) => r.id);` then `const attSet = new Set<string>();` then `if (ids.length) { const { data: atts } = await sb.from('mh_attachments').select('post_id').in('post_id', ids).eq('kind', 'creative'); (atts || []).forEach((a: { post_id: string }) => attSet.add(a.post_id)); }`.
5. In the same file change the filter (currently line 49 `.filter((r) => ((r.media_urls as string[] | null)?.length ?? 0) > 0 || !!r.output_link)`) to `.filter((r) => ((r.media_urls as string[] | null)?.length ?? 0) > 0 || !!r.output_link || attSet.has(r.id))`.
6. Do NOT change any other logic (publish_status filter, ordering, limits). Keep the added query scoped by `.in('post_id', ids)` so it never runs unbounded.

## Verification

Run `npx tsc --noEmit` — must pass. Then in the running app (npm run dev) open Content Review in the user's Chrome for a post whose ONLY creative was uploaded via the task modal (present in mh_attachments kind='creative', absent from media_urls/output_link): the 'No creative attached' warning must disappear and 'Push to Schedule' must be enabled. Click it, then open the Scheduler → 'To schedule' tab and confirm the same post now appears and the count includes it. Confirm a post with genuinely no media/link/attachment still shows disabled.

## Risk

Low. Adds one extra Supabase read per gate load, scoped by id list so bounded. If attach ever writes a different kind value the Set stays empty and behavior is unchanged (no regression, just no fix) — that is why step 1 verifies the literal.
