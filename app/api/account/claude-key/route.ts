import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { canUseConnector, connectorStatus, issueKey, revokeKey } from "@/lib/claude-connector";

// GET    → { allowed, connected, createdAt, lastUsedAt }   (My Account → Connect Claude)
// POST   → { key }  a new personal key (shown once; replaces any old one)
// DELETE → revoke the key
// Allowed only with the "Connect Claude" permission (Team page) or for admins.
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const allowed = await canUseConnector(uid);
  return NextResponse.json({ allowed, ...(allowed ? await connectorStatus(uid) : { connected: false }) });
}

export async function POST() {
  const uid = getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await canUseConnector(uid))) return NextResponse.json({ error: "Ask an admin to switch on “Connect Claude” for you (Team page)." }, { status: 403 });
  return NextResponse.json({ key: await issueKey(uid) });
}

export async function DELETE() {
  const uid = getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await revokeKey(uid);
  return NextResponse.json({ ok: true });
}
