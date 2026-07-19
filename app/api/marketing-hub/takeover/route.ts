import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { postTeamMessage, MH_NAME } from "@/lib/mh-chat";

// POST /api/marketing-hub/takeover  { postId, newOwnerKey }
// Swaps ownership: the incoming person becomes the owner, the old owner is dropped from collabs
// (they were on standby as a video editor sibling; taking over means the other releases the task).

const VALID_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { postId?: string; newOwnerKey?: string };
    if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
    if (!body.newOwnerKey || !VALID_KEYS.has(body.newOwnerKey)) {
      return NextResponse.json({ error: "newOwnerKey required" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const before = await sb.from("mh_posts").select("owner_key").eq("id", body.postId).single();
    if (before.error) throw new Error(before.error.message);

    const oldOwner = before.data.owner_key;
    if (oldOwner === body.newOwnerKey) return NextResponse.json({ ok: true, noChange: true });

    await sb.from("mh_posts").update({ owner_key: body.newOwnerKey }).eq("id", body.postId);

    // Remove new owner from collabs (they were on standby)
    await sb.from("mh_post_collaborators").delete().eq("post_id", body.postId).eq("member_key", body.newOwnerKey);

    if (oldOwner === "nikhil" || oldOwner === "nandu") {
      // Sibling editor drops off — the other one released the task
      await sb.from("mh_post_collaborators").delete().eq("post_id", body.postId).eq("member_key", oldOwner);
    } else if (oldOwner) {
      // Writer / anyone else stays as a collaborator so they can follow the task
      await sb.from("mh_post_collaborators").upsert(
        [{ post_id: body.postId, member_key: oldOwner }],
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
