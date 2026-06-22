import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();
  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  setSession();
  return NextResponse.json({ ok: true });
}
