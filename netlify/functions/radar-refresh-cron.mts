// Netlify Scheduled Function — fires hourly and pokes the Next.js API route that
// refreshes Content Radar's alerts. The actual work stays in lib/content-radar so all
// the Supabase + feed logic lives with the rest of the app; this file only exists
// because Netlify's `schedule` attribute can't be attached directly to Next.js App
// Router routes.

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });

  const baseUrl = process.env.URL || "https://goocampus-ig-dashboard.netlify.app";
  const basePath = process.env.BASE_PATH ?? "/gc-dashboard";

  // BASE_PATH is read at build time by next.config.mjs but at RUN time here, and the
  // two need not agree — the stories cron spent a while 404ing every hour for exactly
  // this reason. Try the resolved path, fall back to the root on a 404.
  const paths = [...new Set([`${basePath}/api/cron/radar-refresh`, `/api/cron/radar-refresh`])];
  let r: Response | null = null;
  let target = "";
  for (const path of paths) {
    target = `${baseUrl}${path}`;
    r = await fetch(target, { headers: { "x-cron-secret": secret } });
    if (r.status !== 404) break;
  }
  const body = await r!.text();
  if (!r!.ok) console.error(`[radar-refresh-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r!.status });
};

export const config = {
  // Hourly. The sources are Bing News RSS — free, keyless, no quota — and a full run
  // of all four alerts measured 4.3s, so there is nothing to ration. Hourly also means
  // news that breaks overnight is already there at 9 AM, which is the point: the team
  // should never have to press refresh to see today.
  schedule: "@hourly",
};
