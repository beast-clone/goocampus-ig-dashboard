// SendPulse REST API client — used for Instagram DM bridging.
// API docs: https://sendpulse.com/integrations/api
// Auth: OAuth2 client_credentials → bearer token (lives ~1h).

const API_BASE = "https://api.sendpulse.com";

type CachedToken = { token: string; expiresAt: number };
let tokenCache: CachedToken | null = null;

function getCreds() {
  const id = process.env.SENDPULSE_CLIENT_ID;
  const secret = process.env.SENDPULSE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SENDPULSE_CLIENT_ID / SENDPULSE_CLIENT_SECRET not set");
  return { id, secret };
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const { id, secret } = getCreds();
  const res = await fetch(`${API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  const j = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string; message?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(`SendPulse auth failed (${res.status}): ${j.error_description || j.message || j.error || JSON.stringify(j).slice(0, 200)}`);
  }
  tokenCache = {
    token: j.access_token,
    expiresAt: Date.now() + (j.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

async function sget<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const j = await res.json();
  if (!res.ok) {
    throw new Error(`SendPulse ${path} → ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  return j as T;
}

async function spost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) {
    throw new Error(`SendPulse ${path} → ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  return j as T;
}

// ---- Public surface ----

export type SPBot = {
  id: string;
  channel_data?: { username?: string; name?: string; id?: string };
  inbox?: { total: number; unread: number };
  status?: number;
};

// List all connected bots (Telegram, Instagram, WhatsApp etc.)
export async function listBots(): Promise<SPBot[]> {
  const j = await sget<{ success: boolean; data: SPBot[] }>("/instagram/bots");
  return j.data || [];
}

// List contacts (followers who messaged the bot)
export type SPContact = {
  id: string;
  bot_id?: string;
  username?: string;
  name?: string;
  status?: number;
  last_activity_at?: string;
  created_at?: string;
};
export async function listContacts(botId: string, limit = 50, offset = 0): Promise<SPContact[]> {
  const j = await sget<{ success: boolean; data: SPContact[] }>(`/instagram/contacts?bot_id=${botId}&limit=${limit}&offset=${offset}`);
  return j.data || [];
}

// Get message history with a specific contact
export type SPMessage = {
  id: string;
  contact_id?: string;
  type?: string;          // "incoming" | "outgoing"
  status?: number;
  data?: { text?: string };
  message?: { text?: string };
  created_at?: string;
};
export async function listMessages(contactId: string, limit = 50, offset = 0): Promise<SPMessage[]> {
  const j = await sget<{ success: boolean; data: SPMessage[] }>(`/instagram/contacts/${contactId}/messages?limit=${limit}&offset=${offset}`);
  return j.data || [];
}

// Send a direct text message to a contact
// SendPulse pattern across channels: POST /{channel}/contacts/send
// body: { contact_id, messages: [{ type: "text", message: { text } }] }
export async function sendText(contactId: string, text: string) {
  return await spost<{ success: boolean; data: unknown }>(`/instagram/contacts/send`, {
    contact_id: contactId,
    messages: [{ type: "text", message: { text } }],
  });
}

// Simple sanity check used by /api/sendpulse/test
export async function authPing(): Promise<{ ok: boolean; bots: number; tokenPrefix: string }> {
  const token = await getToken();
  let bots = 0;
  try {
    const list = await listBots();
    bots = list.length;
  } catch { /* ignore */ }
  return { ok: true, bots, tokenPrefix: token.slice(0, 12) + "…" };
}
