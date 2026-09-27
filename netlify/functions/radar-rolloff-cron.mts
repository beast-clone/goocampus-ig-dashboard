// Netlify Scheduled Function — closes the Content Radar day at 11:59 PM IST and writes
// the report row for everything it showed, including the items nobody touched. The work
// is in app/api/cron/radar-rolloff; this file exists only because Netlify's `schedule`
// attribute can't be attached to a Next.js App Router route.

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });

  const baseUrl = process.env.URL || "https://goocampus-ig-dashboard.netlify.app";
  const basePath = process.env.BASE_PATH ?? "/gc-dashboard";

  // BASE_PATH is read at build time by next.config.mjs but at RUN time here, and the two
  // need not agree — the stories cron spent a while 404ing every night for exactly this
  // reason. Try the resolved path, fall back to the root on a 404.
  const paths = [...new Set([`${basePath}/api/cron/radar-rolloff`, `/api/cron/radar-rolloff`])];
  let r: Response | null = null;
  let target = "";
  for (const path of paths) {
    target = `${baseUrl}${path}`;
    r = await fetch(target, { headers: { "x-cron-secret": secret } });
    if (r.status !== 404) break;
  }
  const body = await r!.text();
  if (!r!.ok) console.error(`[radar-rolloff-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r!.status });
};

export const config = {
  // 18:29 UTC = 11:59 PM IST. Netlify schedules are UTC only, so the offset is baked in
  // here rather than computed — India has no daylight saving, so it never drifts.
  //
  // Just before midnight, not just after: the day's work should be closed on the day it
  // happened, so a thumbs-up at 11:50 PM still counts for that day. The route stamps the
  // date in IST as well, so a late or retried run still closes the day it belongs to.
  schedule: "29 18 * * *",
};
