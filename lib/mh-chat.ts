import type { getSupabase } from "@/lib/supabase";
import { TEAM_NAMES } from "@/lib/team-names";

// Post a system message into the My Day team chat (mh_messages, convo 'team').
// Fire-and-forget: chat is a courtesy mirror of the activity feed — a failure
// here must never fail the write that triggered it.
// Filled from the Team page roster whenever it is read (lib/team-names.ts).
export const MH_NAME = TEAM_NAMES;

export async function postTeamMessage(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  senderKey: string,
  body: string,
): Promise<void> {
  try {
    await sb.from("mh_messages").insert({ convo: "team", sender_key: senderKey, body, kind: "system" });
  } catch { /* never block the caller */ }
}
