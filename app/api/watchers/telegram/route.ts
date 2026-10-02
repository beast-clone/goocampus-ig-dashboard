import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { saveIntegrationToken } from "@/lib/integration-tokens";
import { verifyBotToken, syncTelegramChats } from "@/lib/telegram";
import { safeError } from "@/lib/errors";

// Connect or disconnect the Telegram bot Watchers sends through.
//
//   POST   /api/watchers/telegram { token }   — from @BotFather
//   DELETE /api/watchers/telegram
//
// The token is checked against Telegram before it is stored, so a bad paste fails
// here with a reason rather than silently at the next notice. It is kept in
// mh_integration_tokens rather than an env var so changing bots needs no redeploy.
//
// Admin only: it decides who every notice in the dashboard is sent by.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can connect Telegram." }, { status: 403 });
  const limited = guardRate(req, "watchers-telegram", 10, 300_000);
  if (limited) return limited;

  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Paste the bot token from @BotFather." }, { status: 400 });

  try {
    const bot = await verifyBotToken(token);
    await saveIntegrationToken("telegram", token.trim(), { note: `@${bot.username}` });
    // Anyone who already pressed Start shows up straight away, so the list is not
    // empty on the first visit after connecting.
    await syncTelegramChats().catch(() => {});
    return NextResponse.json({ ok: true, bot: bot.username, name: bot.name });
  } catch (err) {
    return NextResponse.json(safeError(err, "Telegram wouldn't accept that token"), { status: 400 });
  }
}

export async function DELETE() {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can disconnect Telegram." }, { status: 403 });
  const sb = getSupabase();
  try {
    // The remembered chats stay: they are who pressed Start, not a credential, and
    // reconnecting the same bot should not mean asking everyone to press Start again.
    if (sb) await sb.from("mh_integration_tokens").delete().eq("provider", "telegram");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't disconnect"), { status: 502 });
  }
}
