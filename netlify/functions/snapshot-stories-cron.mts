import type { Config } from "@netlify/functions";

// Netlify Scheduled Function — fires hourly and pokes the Next.js API route that
// snapshots every account's live stories into Supabase. The actual work stays in
// app/api/cron/snapshot-stories/route.ts so all Meta + Supabase logic lives with
// the rest of the app; this file only exists because Netlify's `schedule` attribute
// can't be attached directly to Next.js App Router routes.

export default async () => {
  const secret = process.env.CRON_SECRET;
  const baseUrl = process.env.URL || "https://goocampus-dashboard.netlify.app";
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });

  const target = `${baseUrl}/gc-dashboard/api/cron/snapshot-stories`;
  const r = await fetch(target, { headers: { "x-cron-secret": secret } });
  const body = await r.text();
  return new Response(body, { status: r.status });
};

export const config: Config = {
  // "@hourly" runs at minute 0 of every hour. Netlify's cron parser supports the
  // predefined @hourly / @daily / @weekly aliases and standard 5-field cron strings.
  schedule: "@hourly",
};
