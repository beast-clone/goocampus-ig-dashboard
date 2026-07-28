import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js App Router caches fetch() responses in its Data Cache by default,
    // which made Supabase reads go stale (new/edited rows didn't appear until the
    // cache expired or the server restarted). Force no-store so every query is live.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return cached;
}
