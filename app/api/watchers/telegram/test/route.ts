import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { hasTelegram, sendTelegram, syncTelegramChats } from "@/lib/telegram";
import { safeError } from "@/lib/errors";

// Prove the bot can actually reach people, before a notice depends on it.
//
//   POST /api/watchers/telegram/test
//
// Goes to everyone who has pressed Start, because that is the thing being tested:
// a bot can only message someone who has, and the failure people hit is "I never
// started it", which only shows up by trying. One chat failing does not stop the
// rest — a blocked bot in one person's Telegram should not look like an outage.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const limited = guardRate(req, "watchers-telegram-test", 5, 300_000);
  if (limited) return limited;

  if (!(await hasTelegram())) return NextResponse.json({ ok: false, reason: "No bot is connected yet." });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, reason: "Supabase is not configured." });

  try {
    // Catch anyone who pressed Start since the page was opened, so a test run
    // straight after does not report them missing.
    await syncTelegramChats().catch(() => {});
    const { data } = await sb.from("mh_telegram_chats").select("chat_id, name");
    const chats = (data || []) as { chat_id: string; name: string }[];
    if (!chats.length) {
      return NextResponse.json({ ok: false, reason: "Nobody has pressed Start on the bot yet, so there is no one it is allowed to message." });
    }

    const sent: string[] = [];
    const failed: { name: string; why: string }[] = [];
    for (const c of chats) {
      try {
        await sendTelegram(c.chat_id, "<b>Watchers — test message</b>\n\nIf you are reading this, new counselling notices can reach you here.");
        sent.push(c.name);
      } catch (e) { failed.push({ name: c.name, why: (e as Error).message }); }
    }
    return NextResponse.json({ ok: sent.length > 0, sent, failed });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't send the Telegram test"), { status: 502 });
  }
}
