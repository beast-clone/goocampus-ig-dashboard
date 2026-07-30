import { NextResponse } from "next/server";
import { getIntegrationToken } from "@/lib/integration-tokens";

// Simple in-memory cache so we don't hammer Meta on every page load.
let cached: { fetchedAt: number; payload: TokenStatus } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

type TokenStatus = {
  valid: boolean;
  expiresAt: number | null; // unix seconds, 0/null = never expires
  daysRemaining: number | null;
  scopesCount: number;
  appId?: string;
  error?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const userToken = await getIntegrationToken("meta");

  if (!appId || !appSecret || !userToken) {
    return NextResponse.json({ valid: false, expiresAt: null, daysRemaining: null, scopesCount: 0, error: "Meta app credentials not configured" });
  }

  try {
    const r = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${appId}|${appSecret}`,
      { cache: "no-store" },
    );
    const j = await r.json();
    if (!r.ok || j.error || !j.data) {
      const payload: TokenStatus = { valid: false, expiresAt: null, daysRemaining: null, scopesCount: 0, error: j.error?.message || "debug_token failed" };
      cached = { fetchedAt: Date.now(), payload };
      return NextResponse.json(payload);
    }
    const expiresAt = typeof j.data.expires_at === "number" ? j.data.expires_at : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const daysRemaining = expiresAt && expiresAt > 0
      ? Math.max(0, Math.floor((expiresAt - nowSec) / 86400))
      : null; // null means "never expires"
    const payload: TokenStatus = {
      valid: j.data.is_valid === true,
      expiresAt: expiresAt || null,
      daysRemaining,
      scopesCount: Array.isArray(j.data.scopes) ? j.data.scopes.length : 0,
      appId: j.data.app_id,
    };
    cached = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ valid: false, expiresAt: null, daysRemaining: null, scopesCount: 0, error: (err as Error).message }, { status: 500 });
  }
}
