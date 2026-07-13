import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { format, subDays } from "date-fns";

// Cache warm-up job.
//
// The heavy endpoints (Ads, Leads, YouTube, AI Reports, per-post insights) are
// slow on a COLD cache — 5–30s. This job pre-loads them so a real visitor (or a
// live demo) always lands on a warm cache. It mints a short-lived admin session
// the same way lib/auth.ts does, then hits each endpoint server-side (no force —
// it fills cold caches and returns instantly for already-warm ones).
//
//   GET /api/cron/warm    Header: x-cron-secret: <CRON_SECRET>   (or ?secret=)
//
// Schedule it (n8n / Netlify scheduled function / external cron) every ~30 min in
// production. In local dev, instrumentation.ts fires it automatically on boot.

const ACCOUNTS = ["goocampus", "goocampusworld", "12thplusdotcom", "samvaya_matrimony"];

function mintSession(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return "";
  const token = randomBytes(24).toString("hex");
  const payload = `warm:a:${token}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `gc_session=${payload}.${sig}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const provided = req.headers.get("x-cron-secret") || url.searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookie = mintSession();
  if (!cookie) return NextResponse.json({ error: "SESSION_SECRET not configured" }, { status: 500 });

  // App base = everything before "/api/cron/warm" (keeps any basePath prefix intact).
  const appBase = req.url.slice(0, req.url.indexOf("/api/cron/warm"));
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), 30), "yyyy-MM-dd");

  // Per-account core (what the analytics tabs hit) + org-wide heavy endpoints.
  const targets: string[] = [];
  for (const a of ACCOUNTS) {
    targets.push(`/api/insights?accountId=${a}&from=${from}&to=${to}`);
    targets.push(`/api/posts?accountId=${a}&from=${from}&to=${to}&limit=500&insights=true`);
    targets.push(`/api/audience?accountId=${a}`);
  }
  targets.push(`/api/overview-tips?accountId=goocampus&from=${from}&to=${to}`);
  targets.push(`/api/ads?from=${from}&to=${to}`);
  targets.push(`/api/ads/breakdowns?from=${from}&to=${to}`);
  targets.push(`/api/leads?accountId=goocampus&from=${from}&to=${to}`);
  targets.push(`/api/leads-crm?from=${from}&to=${to}`);
  targets.push(`/api/youtube`);
  targets.push(`/api/youtube/uploads`);
  targets.push(`/api/ai-report?accountId=goocampus&period=monthly`);
  targets.push(`/api/post-planner`);

  const t0 = Date.now();
  const results = await Promise.all(
    targets.map(async (path) => {
      const s = Date.now();
      try {
        const r = await fetch(appBase + path, { headers: { cookie }, cache: "no-store" });
        return { path: path.split("?")[0], status: r.status, ms: Date.now() - s };
      } catch (e) {
        return { path: path.split("?")[0], status: 0, ms: Date.now() - s, error: (e as Error).message.slice(0, 60) };
      }
    }),
  );

  const ok = results.filter((r) => r.status === 200).length;
  return NextResponse.json({
    warmed: results.length,
    ok,
    failed: results.length - ok,
    totalMs: Date.now() - t0,
    at: new Date().toISOString(),
    results,
  });
}
