import { NextResponse } from "next/server";
import { listSkills } from "@/lib/marketing-skills";

// GET /api/marketing-skills → the library manifest (metadata only, no doc bodies).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ skills: listSkills() });
}
