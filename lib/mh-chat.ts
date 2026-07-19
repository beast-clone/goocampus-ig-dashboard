import type { getSupabase } from "@/lib/supabase";

// Post a system message into the My Day team chat (mh_messages, convo 'team').
// Fire-and-forget: chat is a courtesy mirror of the activity feed — a failure
// here must never fail the write that triggered it.
export const MH_NAME: Record<string, string> = {
  manya: "Manya", praveen: "Praveen", nikhil: "Nikhil", nandu: "Nandu", maheen: "Maheen",
};

export async function postTeamMessage(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  senderKey: string,
  body: string,
): Promise<void> {
  try {
    await sb.from("mh_messages").insert({ convo: "team", sender_key: senderKey, body, kind: "system" });
  } catch { /* never block the caller */ }
}
