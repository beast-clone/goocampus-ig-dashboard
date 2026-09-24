import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import {
  readChats, readSession, requestPairingCode, disconnectSession,
  normalisePhone, accountSlug, relayHonoursAccount, DEFAULT_ACCOUNT,
} from "@/lib/whatsapp-session";

// The WhatsApp accounts behind Community Broadcast.
//
//   GET  ?session=<name>   -> every linked account, and one account's detail
//   POST { action: "connect",    phone, session? , label? }
//   POST { action: "disconnect", session }
//
// An "account" is a WAHA session, which is one linked WhatsApp number. The first
// one is named "default" and must stay that way — every message queued before
// multi-account has no account on it and falls back to that name.
//
// Session-authed like the rest of the dashboard. The WAHA call itself happens in
// n8n; see lib/whatsapp-session.ts for why the dashboard cannot make it.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const session = new URL(req.url).searchParams.get("session") || DEFAULT_ACCOUNT;
  try {
    // One call gives every account; the picked one's detail comes from the same list.
    const { accounts, quota } = await readChats(session);
    const picked = accounts.find((a) => a.name === session) || null;
    return NextResponse.json({
      ok: true,
      accounts,
      // What WhatsApp says about this number's headroom, when it says anything.
      quota: quota ?? null,
      session: picked
        ? { status: picked.status as never, phone: picked.phone, name: picked.label }
        : await readSession(session),
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the WhatsApp accounts"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json().catch(() => ({}))) as
      { action?: string; phone?: string; session?: string; label?: string };
    const action = (b.action || "").trim();

    if (action === "disconnect") {
      const session = (b.session || "").trim();
      if (!session) return NextResponse.json({ error: "which account?" }, { status: 400 });
      await disconnectSession(session);
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

      // Relinking an existing account keeps its name. A new one gets a name derived
      // from its label, so the session is recognisable in WAHA and in n8n's logs.
      let session = (b.session || "").trim();
      const addingNew = !session;
      if (addingNew) {
        const { accounts } = await readChats(DEFAULT_ACCOUNT).catch(() => ({ accounts: [] as { name: string }[] }));
        session = accounts.length === 0
          ? DEFAULT_ACCOUNT
          : accountSlug(b.label || phone, accounts.map((a) => a.name));
      }

      // Adding a second number is the dangerous case: an n8n relay that still
      // ignores the account would relink the live one instead.
      if (addingNew && session !== DEFAULT_ACCOUNT && !(await relayHonoursAccount())) {
        return NextResponse.json({
          error: "Adding a second number needs the n8n workflow \"WAHA Session Control\" published with its multi-account change. Until then this would relink the number already in use, so it has been stopped.",
        }, { status: 409 });
      }

      const { code } = await requestPairingCode(phone, session);
      if (!code) throw new Error("WhatsApp did not return a pairing code — try again in a moment");
      return NextResponse.json({ ok: true, code, phone, session });
    }

    return NextResponse.json({ error: "action must be 'connect' or 'disconnect'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "That did not work"), { status: 502 });
  }
}
