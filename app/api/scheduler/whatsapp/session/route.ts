import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { readSession, requestPairingCode, disconnectSession, normalisePhone } from "@/lib/whatsapp-session";

// The linked WhatsApp account behind Community Broadcast.
//
//   GET  /api/scheduler/whatsapp/session   -> which number is linked, and its state
//   POST /api/scheduler/whatsapp/session   -> { action: "connect", phone } | { action: "disconnect" }
//
// Session-authed like the rest of the dashboard (middleware gates it) — this is a
// people-facing screen, not a cron target. The actual WAHA call happens in n8n;
// see lib/whatsapp-session.ts for why the dashboard cannot make it itself.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, session: await readSession() });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the WhatsApp account"), { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { action?: string; phone?: string };
    const action = (b.action || "").trim();

    if (action === "disconnect") {
      await disconnectSession();
      return NextResponse.json({ ok: true });
    }

    if (action === "connect") {
      const phone = normalisePhone(b.phone || "");
      if (!phone) {
        return NextResponse.json(
          { error: "That does not look like a phone number. Include the country code for anything outside India." },
          { status: 400 },
        );
      }
      const { code } = await requestPairingCode(phone);
      if (!code) throw new Error("WhatsApp did not return a pairing code — try again in a moment");
      return NextResponse.json({ ok: true, code, phone });
    }

    return NextResponse.json({ error: "action must be 'connect' or 'disconnect'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "That did not work"), { status: 502 });
  }
}
