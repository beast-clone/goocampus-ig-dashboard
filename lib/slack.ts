// Slack notifications via the "GooCampus Marketing OS" app's Incoming Webhook.
// The webhook posts to one channel (currently #creative_marketing); set
// SLACK_WEBHOOK_URL in the env. Best-effort — never blocks the caller.

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;

export function hasSlack(): boolean {
  return !!WEBHOOK;
}

// Post mrkdwn text to Slack. Returns quietly if not configured or on any error.
export async function postSlack(text: string): Promise<void> {
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch { /* best-effort — Slack outages must not break the workflow */ }
}
