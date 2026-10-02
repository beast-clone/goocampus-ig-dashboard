import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { fetchRoster } from "@/lib/team-db";
import { emailStatus } from "@/lib/email";
import { botUsername, hasTelegram, syncTelegramChats } from "@/lib/telegram";

// Who a watcher can notify: the team's emails (plus any typed in before), the
// Telegram chats that have started the bot, and whether email / Telegram are set up.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  await syncTelegramChats().catch(() => {});
  const mail = await emailStatus();
  const roster = (await fetchRoster()).filter((u) => u.active && u.email);
  const [{ data: ws }, { data: chats }] = await Promise.all([
    sb ? sb.from("mh_watchers").select("emails") : Promise.resolve({ data: [] }),
    sb ? sb.from("mh_telegram_chats").select("chat_id, name, username, kind").order("name") : Promise.resolve({ data: [] }),
  ]);
  const team = roster.map((u) => ({ email: u.email.toLowerCase(), name: u.name }));
  const known = new Set(team.map((t) => t.email));
  const others = [...new Set(((ws || []) as { emails: string[] }[]).flatMap((w) => w.emails))].filter((e) => !known.has(e)).sort();
  return NextResponse.json({
    team, others, chats: chats || [],
    email: mail.ok, emailFrom: mail.from, emailVia: mail.via,
    telegram: hasTelegram(), bot: await botUsername(),
  });
}
