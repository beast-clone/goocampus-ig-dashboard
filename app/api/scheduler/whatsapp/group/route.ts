import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { readGroup, checkNumber, inviteLink, DEFAULT_ACCOUNT } from "@/lib/whatsapp-session";
import { normalizeChatId } from "@/lib/whatsapp";

// Group members, the invite link, and adding people.
//
//   GET  ?groupId=…@g.us            -> members + invite link
//   POST { groupId, phones: [] }    -> check each number, add the ones on WhatsApp
//
// Every number is checked against WhatsApp first: adding one that has no account
// does nothing and tells you nothing. Adds go in small batches with a gap, because
// adding a crowd at once is one of the documented ways to lose the number.
export const dynamic = "force-dynamic";

const CHUNK = 5;                 // how many to hand WhatsApp at a time
const GAP_MS = 4000;             // pause between chunks
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const groupId = (url.searchParams.get("groupId") || "").trim();
  const session = url.searchParams.get("session") || DEFAULT_ACCOUNT;
  if (!groupId.endsWith("@g.us")) return NextResponse.json({ error: "groupId must be a group (…@g.us)" }, { status: 400 });

  try {
    const g = await readGroup(groupId, session);
    return NextResponse.json({ ok: true, ...g, inviteLink: inviteLink(g.inviteCode) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read that group"), { status: 502 });
  }
}

/** What the engine's code means, in words the panel can show. */
function outcome(code: string, inviteSent?: boolean): { state: "added" | "invited" | "already" | "failed"; text: string } {
  switch (String(code)) {
    case "200": return { state: "added", text: "Added" };
    case "403": return inviteSent
      ? { state: "invited", text: "They don't allow being added — WhatsApp sent them an invite instead" }
      : { state: "invited", text: "They don't allow being added — send them the invite link" };
    case "409": return { state: "already", text: "Already in the group" };
    case "408": return { state: "failed", text: "Left the group recently — WhatsApp won't allow a re-add yet" };
    case "419": return { state: "failed", text: "The group is full" };
    case "404": return { state: "failed", text: "Not on WhatsApp" };
    default: return { state: "failed", text: `WhatsApp refused (${code})` };
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { groupId?: string; phones?: string[]; session?: string };
    const groupId = (b.groupId || "").trim();
    const session = b.session || DEFAULT_ACCOUNT;
    if (!groupId.endsWith("@g.us")) return NextResponse.json({ error: "groupId must be a group (…@g.us)" }, { status: 400 });

    const wanted = [...new Set((b.phones || []).map((p) => normalizeChatId(p)).filter((x): x is string => !!x && x.endsWith("@c.us")))];
    if (!wanted.length) return NextResponse.json({ error: "no valid numbers" }, { status: 400 });
    if (wanted.length > 100) return NextResponse.json({ error: "100 at a time is the most this will do in one go" }, { status: 400 });

    // 1. Who is actually on WhatsApp? Adding the rest is wasted, and looks worse.
    const rows: { id: string; state: string; text: string }[] = [];
    const addable: string[] = [];
    for (const id of wanted) {
      try {
        const c = await checkNumber(id.replace("@c.us", ""), session);
        if (c.exists === false) { rows.push({ id, state: "failed", text: "Not on WhatsApp" }); continue; }
      } catch { /* could not ask — try the add anyway */ }
      addable.push(id);
    }

    // 2. Add in small batches, with a gap. Slower on purpose.
    let inviteCode: string | null = null;
    let count = 0;
    for (let i = 0; i < addable.length; i += CHUNK) {
      const slice = addable.slice(i, i + CHUNK);
      const g = await readGroup(groupId, session, slice);
      inviteCode = g.inviteCode ?? inviteCode;
      count = g.count ?? count;
      const seen = new Set<string>();
      for (const r of g.results || []) {
        const o = outcome(r.code, r.inviteSent);
        // ids come back as @lid sometimes; match on the digits we sent
        const digits = (r.id || "").split("@")[0];
        const mine = slice.find((s) => s.startsWith(digits)) || r.id;
        seen.add(mine);
        rows.push({ id: mine, ...o });
      }
      for (const s of slice) if (!seen.has(s)) rows.push({ id: s, state: "added", text: "Added" });
      if (i + CHUNK < addable.length) await sleep(GAP_MS);
    }

    return NextResponse.json({ ok: true, results: rows, count, inviteLink: inviteLink(inviteCode) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not add to that group"), { status: 502 });
  }
}
