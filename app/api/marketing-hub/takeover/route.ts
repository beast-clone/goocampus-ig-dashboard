import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { postTeamMessage, MH_NAME } from "@/lib/mh-chat";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { defaultCollaboratorFor } from "@/lib/task-create";

// POST /api/marketing-hub/takeover  { postId, newOwnerKey, role? }
// Swaps ownership: the incoming person becomes the owner.
//
// Collaborators are then reconciled to exactly who belongs on the task (rules
// agreed 22 Sep). The owner is whoever EDITS, and the set is:
//   · the default collaborator — Manya, or Nandu on 12thPlus / GC India
//   · the presenter, when someone else shot the video (custom.presenter_key)
// Nobody is ever both owner and collaborator, so the new owner always comes off
// the collaborator list. Anyone outside that set is dropped, so the sibling
// editor on standby releases the task unless they are the presenter.

const VALID_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("edit_tasks");
    if (denied) return denied;

    const body = (await req.json()) as { postId?: string; newOwnerKey?: string; role?: string };
    if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
    if (!body.newOwnerKey || !VALID_KEYS.has(body.newOwnerKey)) {
      return NextResponse.json({ error: "newOwnerKey required" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const before = await sb.from("mh_posts").select("owner_key, sbu, custom").eq("id", body.postId).single();
    if (before.error) throw new Error(before.error.message);

    const oldOwner = before.data.owner_key;
    if (oldOwner === body.newOwnerKey) return NextResponse.json({ ok: true, noChange: true });

    // The ownership swap MUST stick — if it fails, bail before we log/announce a
    // claim that never happened (activity + chat below would otherwise lie).
    const swap = await sb.from("mh_posts").update({ owner_key: body.newOwnerKey }).eq("id", body.postId);
    if (swap.error) throw new Error(swap.error.message);

    // Who SHOULD be on this task once the new owner has it.
    const custom = (before.data.custom || {}) as Record<string, unknown>;
    const presenter = typeof custom.presenter_key === "string" ? custom.presenter_key : null;
    const want = new Set<string>();
    const def = defaultCollaboratorFor(before.data.sbu as string | null, body.newOwnerKey);
    if (def) want.add(def);
    // Someone shot it, someone else is cutting it → the presenter collaborates.
    if (presenter && presenter !== body.newOwnerKey) want.add(presenter);
    // A writer who handed it over keeps following it; the sibling editor does not.
    if (oldOwner && oldOwner !== "nikhil" && oldOwner !== "nandu") want.add(oldOwner);
    want.delete(body.newOwnerKey);   // never both owner and collaborator

    const existing = await sb.from("mh_post_collaborators").select("member_key").eq("post_id", body.postId);
    const have = new Set((existing.data || []).map((r) => r.member_key as string));
    const drop = [...have].filter((k) => !want.has(k));
    const add = [...want].filter((k) => !have.has(k));
    if (drop.length) await sb.from("mh_post_collaborators").delete().eq("post_id", body.postId).in("member_key", drop);
    if (add.length) {
      await sb.from("mh_post_collaborators").upsert(
        add.map((member_key) => ({ post_id: body.postId as string, member_key })),
        { onConflict: "post_id,member_key", ignoreDuplicates: true }
      );
    }


    await sb.from("mh_activity").insert({
      post_id: body.postId,
      actor_key: body.newOwnerKey,
      action: "claim",
      detail: `claimed the task from ${oldOwner || "unassigned"}`,
    });

    bustMarketingHubCache(); // owner change must reflect on the next hub fetch

    // Mirror the claim into the team chat so everyone sees who grabbed it.
    const claimed = await sb.from("mh_posts").select("particulars").eq("id", body.postId).single();
    await postTeamMessage(sb, body.newOwnerKey, `${MH_NAME[body.newOwnerKey] || body.newOwnerKey} claimed “${claimed.data?.particulars || "a task"}”.`);

    return NextResponse.json({ ok: true, newOwnerKey: body.newOwnerKey });
  } catch (err) {
    return NextResponse.json(safeError(err, "Take over failed"), { status: 502 });
  }
}
