// Linking and unlinking the WhatsApp account behind Community Broadcast.
//
// The dashboard cannot talk to WAHA. WAHA publishes no port and sits on the VPS's
// private Docker network — that is deliberate, and it is what keeps a "send as us"
// API off the internet. So reading the account, linking a new number and unlinking
// all go through the same n8n relay the sender uses: n8n is on that network, makes
// the real WAHA call, and hands back the answer.
//
// Linking uses a PAIRING CODE, not a QR. A QR is only valid for ~20 seconds and
// WhatsApp gives up after six refreshes, which is not enough time for someone to
// walk to the phone. The code lasts minutes and needs no camera.

export type WaSessionStatus =
  | "WORKING"        // linked and able to send
  | "SCAN_QR_CODE"   // waiting for the code to be entered on the phone
  | "STARTING"
  | "STOPPED"        // nothing linked
  | "FAILED"
  | "UNKNOWN";

export type WaSession = {
  status: WaSessionStatus;
  /** Digits only, e.g. 917483800702. Null when nothing is linked. */
  phone: string | null;
  /** The WhatsApp profile name of the linked account. */
  name: string | null;
};

const HOOK =
  process.env.WAHA_SESSION_WEBHOOK ||
  "https://n8n.srv1046538.hstgr.cloud/webhook/waha-session";

const READ_HOOK =
  process.env.WAHA_READ_WEBHOOK ||
  "https://n8n.srv1046538.hstgr.cloud/webhook/waha-read";

async function relay<T>(action: string, extra: Record<string, unknown> = {}, hook = HOOK): Promise<T> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not configured");

  let res: Response;
  try {
    res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action, ...extra }),
      cache: "no-store",
    });
  } catch {
    // n8n unreachable is the common failure here, and "fetch failed" tells the
    // person nothing. Say which hop broke.
    throw new Error("Could not reach the WhatsApp relay (n8n). Is the workflow published?");
  }

  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON, keep the raw text */ }

  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error || text.slice(0, 200);
    throw new Error(msg || `The relay returned ${res.status}`);
  }
  return body as T;
}

export const readSession = () => relay<WaSession>("status");
export const requestPairingCode = (phone: string) => relay<{ code: string }>("connect", { phone });
export const disconnectSession = () => relay<{ ok: true }>("disconnect");

/** One synced chat from WhatsApp. `label` is null when the contact has no saved name. */
export type SyncedChat = { id: string; label: string | null; kind: "contact" | "group" | "channel" };
export type WaAccount = { name: string; status: string; phone: string | null; label: string | null };

/**
 * The live contact / group / channel list, and every linked account.
 *
 * Read-only, and it goes to its own relay rather than the session one — that
 * workflow returns the lists as TEXT on purpose. WAHA replies with arrays, and
 * n8n turns an array into one item per element and stores each as execution
 * data; ~2000 items ran n8n out of heap and took it down. Keep it that way.
 */
export const readChats = (session = "default") =>
  relay<{ session: string; recipients: SyncedChat[]; accounts: WaAccount[] }>("chats", { session }, READ_HOOK);

/**
 * Digits only, no "+" — the form WhatsApp wants.
 *
 * A bare 10-digit number is treated as Indian, because that is how everyone here
 * types their own number. Anything else must carry its own country code: silently
 * prefixing 91 to a foreign number produces a real Indian number belonging to a
 * stranger, and we have shipped that bug once already. The caller shows the
 * resolved number back to the person before anything is linked.
 */
export function normalisePhone(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** 917483800702 -> +91 74838 00702, for display only. */
export function prettyPhone(digits: string | null): string {
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}
