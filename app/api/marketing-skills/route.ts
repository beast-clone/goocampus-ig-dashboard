import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listSkills } from "@/lib/marketing-skills";

// GET /api/marketing-skills → the library manifest (metadata only, no doc bodies).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  return NextResponse.json({ skills: listSkills() });
}
