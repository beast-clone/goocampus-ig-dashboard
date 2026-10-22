import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { getAnnounceSetting, saveAnnounceSetting, runPublishAnnounce } from "@/lib/publish-announce";

// The "Published posts → team group" switch on the Watchers page (22 Oct).
//   GET  → { on, since, chat }
//   POST { on?, chat? }        admin only — it posts to the whole team
//   POST { testPostId }        admin only — announce one post now, for a test
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  return NextResponse.json(await getAnnounceSetting());
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change this." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { on?: boolean; chat?: string; testPostId?: string };
  if (b.testPostId) return NextResponse.json(await runPublishAnnounce({ onlyPostId: b.testPostId }));
  const patch: { on?: boolean; chat?: string } = {};
  if (typeof b.on === "boolean") patch.on = b.on;
  if (typeof b.chat === "string" && b.chat.trim()) patch.chat = b.chat.trim();
  return NextResponse.json(await saveAnnounceSetting(patch));
}
