import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { checkNumber, DEFAULT_ACCOUNT } from "@/lib/whatsapp-session";
import { normalizeChatId } from "@/lib/whatsapp";

// GET /api/scheduler/whatsapp/check?phone=+91…&session=…
//
// Is a typed number on WhatsApp? Asked only when someone types a number into the
// picker, and debounced there — WhatsApp rate-limits this lookup and leaning on
// it is itself a way to get a number flagged.
//
// { exists: true | false | null } — null means we could not ask, which the UI
// must not show as "not on WhatsApp".
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const raw = (url.searchParams.get("phone") || "").trim();
  const session = url.searchParams.get("session") || DEFAULT_ACCOUNT;

  // Only ever a plain number: a group or channel id has no "does this exist" answer.
  const chatId = normalizeChatId(raw);
  if (!chatId || !chatId.endsWith("@c.us")) {
    return NextResponse.json({ exists: null, reason: "not a phone number" });
  }
  const phone = chatId.replace("@c.us", "");

  try {
    const r = await checkNumber(phone, session);
    return NextResponse.json({ phone, exists: r.exists, chatId: r.chatId || chatId });
  } catch (err) {
    // The relay being down is not an answer about the number.
    return NextResponse.json(safeError(err, "Could not check that number"), { status: 502 });
  }
}
