// Auto-warm the dashboard's caches in LOCAL DEV so first page loads are never
// cold during a demo. Runs once ~25s after the dev server boots, then every
// 30 min. Production is serverless (no long-lived process for setInterval) —
// schedule an external call to /api/cron/warm there instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "development") return;

  const base = process.env.WARM_URL || "http://localhost:4324";
  const secret = process.env.CRON_SECRET || "";
  const warm = async () => {
    try {
      await fetch(`${base}/api/cron/warm`, { headers: { "x-cron-secret": secret } });
    } catch {
      /* server not ready yet / offline — ignore, the interval will retry */
    }
  };

  setTimeout(warm, 25_000);
  setInterval(warm, 30 * 60 * 1000);
}
