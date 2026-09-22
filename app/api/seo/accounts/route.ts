import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { addExtraAccount, cleanHandle, lookupAccounts, removeExtraAccount } from "@/lib/social-keywords";

// GET    /api/seo/accounts?platform=&q= → matching accounts to confirm before adding
// POST   /api/seo/accounts { platform, handle } → add an account to compare with
// DELETE /api/seo/accounts { platform, handle } → remove one the team added
// The built-in accounts are fixed in lib/social-keywords.ts. After either, the page
// reloads /api/seo/social?fresh=1.
export const dynamic = "force-dynamic";

async function body(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { platform?: string; handle?: string };
  const platform: "instagram" | "youtube" = b.platform === "youtube" ? "youtube" : "instagram";
  return { platform, handle: cleanHandle(b.handle || "") };
}

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "seo-accounts-lookup", 60, 300_000);
  if (limited) return limited;
  const u = new URL(req.url);
  const platform = u.searchParams.get("platform") === "youtube" ? "youtube" : "instagram";
  const q = cleanHandle(u.searchParams.get("q") || "");
  if (q.length < 3) return NextResponse.json({ matches: [] });
  try {
    return NextResponse.json({ matches: await lookupAccounts(platform, platform === "instagram" ? q.replace(/[^\w.]/g, "") : q) });
  } catch (err) {
    return NextResponse.json({ matches: [], error: (err as Error).message }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "seo-accounts", 20, 300_000);
  if (limited) return limited;
  const { platform, handle } = await body(req);
  if (!/^[\w.\-]{2,60}$/.test(handle)) return NextResponse.json({ error: "Enter a handle like @someacademy." }, { status: 400 });
  try {
    const name = await addExtraAccount(platform, handle, getSessionUserId() || undefined);
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const { platform, handle } = await body(req);
  if (!handle) return NextResponse.json({ error: "Missing handle." }, { status: 400 });
  try {
    await removeExtraAccount(platform, handle);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
