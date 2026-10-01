// Netlify Scheduled Function — every 15 minutes, pokes /api/cron/watchers (the logic
// lives in lib/watchers.ts). Same base-path handling as competitor-watch-cron.mts.

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET missing", { status: 500 });
  const baseUrl = process.env.URL || "https://goocampus-ig-dashboard.netlify.app";
  const basePath = process.env.BASE_PATH ?? "/gc-dashboard";
  const paths = [...new Set([`${basePath}/api/cron/watchers`, `/api/cron/watchers`])];
  let r: Response | null = null;
  let target = "";
  for (const path of paths) {
    target = `${baseUrl}${path}`;
    r = await fetch(target, { headers: { "x-cron-secret": secret } });
    if (r.status !== 404) break;
  }
  const body = await r!.text();
  if (!r!.ok) console.error(`[watchers-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r!.status });
};

export const config = { schedule: "*/15 * * * *" };
