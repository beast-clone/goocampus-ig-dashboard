import { NextResponse } from "next/server";
import { authPing, listBots, listContacts, listMessages, sendText } from "@/lib/sendpulse";

// Hit:
//   GET /api/sendpulse/test                → ping + bots + contacts (no send)
//   GET /api/sendpulse/test?send=hi%20!    → also send "hi !" back to the most-recent contact
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sendBody = url.searchParams.get("send");
  const t0 = Date.now();
  try {
    const ping = await authPing();
    const bots = await listBots();
    const firstBot = bots[0];
    let contacts: Awaited<ReturnType<typeof listContacts>> = [];
    let contactsError: string | null = null;
    let messages: Awaited<ReturnType<typeof listMessages>> = [];
    let sendResult: unknown = null;
    let sendError: string | null = null;

    if (firstBot) {
      try { contacts = await listContacts(firstBot.id, 10, 0); }
      catch (e) { contactsError = (e as Error).message; }
    }

    const latest = contacts[0];
    if (latest) {
      try { messages = await listMessages(latest.id, 5, 0); }
      catch { /* ignore */ }

      if (sendBody) {
        try { sendResult = await sendText(latest.id, sendBody); }
        catch (e) { sendError = (e as Error).message; }
      }
    }

    return NextResponse.json({
      ok: true,
      ping,
      botsCount: bots.length,
      contactsCount: contacts.length,
      contactsError,
      contactsSample: contacts.slice(0, 3).map((c) => ({ id: c.id, username: c.username, name: c.name, last_activity_at: c.last_activity_at })),
      latestContactMessages: messages.map((m) => ({ type: m.type, text: m.data?.text || m.message?.text, at: m.created_at })),
      sendResult,
      sendError,
      latencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 }, { status: 500 });
  }
}
