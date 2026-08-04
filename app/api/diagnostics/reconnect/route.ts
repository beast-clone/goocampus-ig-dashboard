import { NextResponse } from "next/server";
import { saveIntegrationToken } from "@/lib/integration-tokens";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";

// POST /api/diagnostics/reconnect  { provider, token, expiresAt? }
// Saves a freshly-reconnected token to mh_integration_tokens so the integration
// goes live WITHOUT a redeploy (the client reads getIntegrationToken() first).
const ALLOWED = new Set(["linkedin", "meta", "youtube"]);

export async function POST(req: Request) {
  try {
    // Admin-only: this writes live OAuth tokens (Meta/LinkedIn/YouTube) the whole
    // dashboard reads. The "system" section is admin-only, so this gates to admins.
    const denied = await requireSection("system");
    if (denied) return denied;

    const b = (await req.json()) as { provider?: string; token?: string; expiresAt?: string | null };
    const provider = String(b.provider || "").toLowerCase();
    const token = String(b.token || "").trim();
    if (!ALLOWED.has(provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    if (token.length < 20) return NextResponse.json({ error: "That token looks too short — paste the full token." }, { status: 400 });
    await saveIntegrationToken(provider, token, { expiresAt: b.expiresAt || null, note: "reconnected via diagnostics" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Reconnect failed"), { status: 502 });
  }
}
