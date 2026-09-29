// Netlify Scheduled Function — every 5 minutes, pokes /api/cron/competitor-watch
// (the logic lives in lib/competitor-watch.ts). Instagram is read on every third run
// (~15 min) because Meta rate-limits Business Discovery.
// Same base-path handling as import-airtable-cron.mts: try BASE_PATH, fall back to root.

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });
  const baseUrl = process.env.URL || "https://goocampus-ig-dashboard.netlify.app";
  const basePath = process.env.BASE_PATH ?? "/gc-dashboard";
  const ig = new Date().getUTCMinutes() % 15 < 5 ? "?ig=1" : "";
  const paths = [...new Set([`${basePath}/api/cron/competitor-watch${ig}`, `/api/cron/competitor-watch${ig}`])];
  let r: Response | null = null;
  let target = "";
  for (const path of paths) {
    target = `${baseUrl}${path}`;
    r = await fetch(target, { headers: { "x-cron-secret": secret } });
    if (r.status !== 404) break;
  }
  const body = await r!.text();
  if (!r!.ok) console.error(`[competitor-watch-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r!.status });
};

export const config = { schedule: "*/5 * * * *" };
