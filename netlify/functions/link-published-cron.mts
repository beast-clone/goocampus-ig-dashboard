// Netlify Scheduled Function — fires once a night and pokes the Next.js API route
// that fills in the Instagram / Facebook / LinkedIn links for posts that went live.
// The actual work stays in app/api/cron/link-published/route.ts so all the Meta +
// LinkedIn + Supabase logic lives with the rest of the app; this file only exists
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
  // One request PER ACCOUNT, all at once. The route's time goes almost entirely on
  // the Instagram / Facebook / LinkedIn fetches, and doing all three accounts in one
  // request measured 21s against a 26s ceiling. A third of the work each, in
  // parallel, keeps every call well clear and the whole night still takes one round.
  const accounts = ["goocampus", "goocampusworld", "12thplusdotcom"];

  const call = async (account: string) => {
    const paths = [...new Set([`${basePath}/api/cron/link-published`, `/api/cron/link-published`])];
    let r: Response | null = null;
    let target = "";
    for (const path of paths) {
      target = `${baseUrl}${path}?account=${account}`;
      r = await fetch(target, { headers: { "x-cron-secret": secret } });
      if (r.status !== 404) break;
    }
    const body = await r!.text();
    if (!r!.ok) console.error(`[link-published-cron] ${target} → ${r!.status} ${body.slice(0, 300)}`);
    return { account, status: r!.status, body: body.slice(0, 400) };
  };

  const results = await Promise.all(accounts.map((a) => call(a).catch((e) => ({ account: a, status: 0, body: String(e) }))));
  const failed = results.filter((x) => x.status < 200 || x.status >= 300);
  return new Response(JSON.stringify({ results }), { status: failed.length === results.length ? 502 : 200 });
};

export const config = {
  // 20:30 UTC = 2:00 AM IST — after the day's posting is done and the platforms have
  // settled, and well clear of the hourly jobs at minute 0.
  schedule: "30 20 * * *",
};
