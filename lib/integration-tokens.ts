// Integration token override — lets the Diagnostics "Reconnect" flow rotate a
// provider's token WITHOUT a redeploy. Reads the `mh_integration_tokens` Supabase
// table first; falls back to the env var. Cached 60s so hot paths don't hit
// Supabase on every call.
//
// To make a provider rotatable: map it here and have its client read the token
// via getIntegrationToken(provider) instead of process.env directly.

import { getSupabase } from "@/lib/supabase";

// provider key -> env var that holds the default/fallback token.
const ENV_KEY: Record<string, string> = {
  linkedin: "LINKEDIN_ACCESS_TOKEN",
  meta: "META_LONG_LIVED_USER_TOKEN",
};

type Cached = { token: string | null; at: number };
const cache = new Map<string, Cached>();
const TTL = 60_000;

// The live token for a provider: Supabase override (if present + unexpired) else env.
export async function getIntegrationToken(provider: string): Promise<string | null> {
  const envVal = process.env[ENV_KEY[provider] || ""] || null;
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < TTL) return hit.token ?? envVal;
  const supa = getSupabase();
  if (!supa) return envVal;
  try {
    const { data } = await supa
      .from("mh_integration_tokens")
      .select("token, expires_at")
      .eq("provider", provider)
      .maybeSingle();
    const fresh = data?.token && (!data.expires_at || new Date(data.expires_at) > new Date());
    const token = fresh ? (data!.token as string) : envVal;
    cache.set(provider, { token, at: Date.now() });
    return token;
  } catch {
    return envVal;   // Supabase unreachable → env fallback, never throws
  }
}

// Save a freshly-reconnected token (from the Diagnostics Reconnect modal).
export async function saveIntegrationToken(
  provider: string,
  token: string,
  opts: { expiresAt?: string | null; note?: string } = {},
): Promise<void> {
  const supa = getSupabase();
  if (!supa) throw new Error("Supabase not configured");
  await supa.from("mh_integration_tokens").upsert(
    {
      provider,
      token: token.trim(),
      refreshed_at: new Date().toISOString(),
      expires_at: opts.expiresAt ?? null,
      note: opts.note ?? null,
    },
    { onConflict: "provider" },
  );
  cache.delete(provider);
}

// Which providers currently have a Supabase override (for the Diagnostics UI).
export async function overriddenProviders(): Promise<Record<string, { refreshedAt: string; expiresAt: string | null }>> {
  const supa = getSupabase();
  if (!supa) return {};
  try {
    const { data } = await supa
      .from("mh_integration_tokens")
      .select("provider, refreshed_at, expires_at");
    const out: Record<string, { refreshedAt: string; expiresAt: string | null }> = {};
    for (const r of data || []) out[r.provider as string] = { refreshedAt: r.refreshed_at as string, expiresAt: (r.expires_at as string) || null };
    return out;
  } catch {
    return {};
  }
}
