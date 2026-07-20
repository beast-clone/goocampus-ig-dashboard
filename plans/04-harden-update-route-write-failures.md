# Make the design auto-handoff atomic and error-check secondary writes in the update route

- **Priority:** P1
- **Area:** shared

## Problem

In app/api/marketing-hub/update/route.ts the primary update (lines 99-107) sets status and returns 200, but the design-work auto-handoff performs a SEPARATE, unchecked update setting owner_key='praveen' (line 200) plus a collaborator upsert (204-207). Neither result's .error is checked. If that second write fails (RLS/transient/FK), the API still returns success while the row stays owned by the writer; the client optimistically shows it handed to Praveen, but the next my-day load() returns owner=writer so the task silently bounces back and never reaches Praveen — status and ownership diverge. The mh_activity insert (152) and the start_at/end_at stamps (158, 163) are likewise unchecked. Separately, AUDIT_LOG (2026-07-18) documents a Postgres trigger mh_fn_log_activity that may ALSO log every UPDATE, which would double every activity row (one app-attributed, one 'System') and risk double notifications — this needs a live check.

## Files

- `app/api/marketing-hub/update/route.ts`

## Steps

1. Make status+ownership atomic for the design handoff. Before the primary update (currently line 99), compute the handoff condition using the already-fetched `before` (line 92-97): add `const deferHandoff = (body as { deferHandoff?: boolean }).deferHandoff === true;` (if not already in scope earlier) and `const willApprove = typeof clean.status === 'string' && clean.status === 'Content - Approved' && before.data.status !== 'Content - Approved';` and `const isDesign = !VIDEO_TYPES.has(String(before.data.type || ''));`. Then: `if (willApprove && !deferHandoff && isDesign && before.data.owner_key !== 'praveen') { clean.owner_key = 'praveen'; }`. Because owner_key is now part of `clean`, the primary update writes status and owner in ONE statement, and the existing activityRows loop (137-151, which iterates Object.keys(clean)) will automatically log the owner_changed row.
2. Delete the now-redundant separate owner update and its manual activity insert (lines 199-202): the `if (data.owner_key !== 'praveen') { await sb...update({owner_key:'praveen'}); await sb...insert({...owner_changed...}); }` block. KEEP the collaborator upsert that follows (the `if (oldOwner && oldOwner !== 'praveen' && oldOwner !== 'maheen')` block, lines 203-208) but wrap it so a failure is at least logged: capture `const collab = await sb.from('mh_post_collaborators').upsert(...); if (collab.error) console.error('collaborator upsert failed', collab.error.message);`. Note `oldOwner` must still be read from `before.data.owner_key` — keep that assignment.
3. Error-check the remaining secondary writes without failing the request: for the activity insert (line 152) capture `const act = await sb.from('mh_activity').insert(activityRows); if (act.error) console.error('activity log failed', act.error.message);`. For the two clock stamps (158, 163) capture the result and console.error on .error. These are non-fatal, so log only — do not change the 200 response.
4. Investigate the duplicate-logging risk (do NOT guess): using the Supabase MCP execute_sql (project Beast Clone wlhbmzaernchwebapszq), run `select tgname, tgenabled from pg_trigger where tgrelid = 'mh_posts'::regclass;` and `select proname from pg_proc where proname = 'mh_fn_log_activity';`. If a trigger on mh_posts that calls mh_fn_log_activity is enabled, the app-side activity insert (137-152) is duplicating it. In that case STOP and flag for Praveen: choose ONE source (recommended: keep app-side logging for actor attribution and disable the trigger) rather than editing further — do not run both.

## Verification

Run `npx tsc --noEmit` — must pass. In the app: approve a design/static task as its writer. Confirm owner flips to Praveen AND stays after a My Day reload (no bounce-back). Verify the task Activity feed shows exactly ONE owner_changed row (not two) — if the trigger investigation found a live duplicate trigger, this is expected to still show two until that decision is made; note it. Approve a video task and confirm ownership still stays with the writer (goes to pool), i.e. the isDesign guard is correct.

## Risk

Medium. Merging owner_key into `clean` changes when owner_changed is logged (now via the diff loop) — verify no duplicate owner_changed row is produced by the code (the trigger question is separate). Do not remove the collaborator upsert. The trigger check is read-only SQL; the actual enable/disable decision is deferred to Praveen.
