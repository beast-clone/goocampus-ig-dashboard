// Netlify Scheduled Function — fires hourly and pokes the Next.js API route that
// pulls new Airtable tasks into the master sheet. The work stays in
// app/api/cron/import-airtable/route.ts so all the Airtable + Supabase logic lives
// with the rest of the app; this file exists only because Netlify's `schedule`
// attribute can't be attached directly to an App Router route.

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });

  // Resolve the base path exactly the way next.config.mjs does, so the URL follows
  // the app instead of being pinned to whatever it was the day this was written.
  // The older snapshot-stories function hardcoded "/gc-dashboard" and kept calling
  // it after the app moved to the root — a 404 every hour, silently.
  const baseUrl = process.env.URL || "https://goocampus-ig-dashboard.netlify.app";
  const basePath = process.env.BASE_PATH ?? "/gc-dashboard";

  // BASE_PATH is read at build time by next.config.mjs but at RUN time here, and
  // the two need not agree. Rather than assume, try the resolved path and fall back
  // to the root on a 404 — the failure mode this whole comment exists because of.
  const paths = [...new Set([`${basePath}/api/cron/import-airtable`, `/api/cron/import-airtable`])];
  let r: Response | null = null;
  let target = "";
  for (const path of paths) {
    target = `${baseUrl}${path}`;
    r = await fetch(target, { headers: { "x-cron-secret": secret } });
    if (r.status !== 404) break;
  }
  const body = await r!.text();
  if (!r!.ok) console.error(`[import-airtable-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r!.status });
};

export const config = {
  // Minute 0 of every hour. Netlify's parser takes the @hourly alias and standard
  // 5-field cron strings.
  schedule: "@hourly",
};
