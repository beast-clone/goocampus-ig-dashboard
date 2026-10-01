// Telegram bot — used by Watchers (docs/WATCHERS_SPEC.md) to message people.
//
// Set TELEGRAM_BOT_TOKEN (from @BotFather). A bot can only message someone who has
// pressed Start on it, or a group it has been added to — so the list of people you
// can pick comes from the bot's own updates (syncTelegramChats), not from a directory.
import { getSupabase } from "@/lib/supabase";

const TOKEN = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
export const hasTelegram = () => !!TOKEN();

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || `HTTP ${r.status}`}`);
  return j.result as T;
}

// The bot's username, so the page can say "open @xyz_bot and press Start".
export async function botUsername(): Promise<string | null> {
  if (!hasTelegram()) return null;
  try { return (await call<{ username?: string }>("getMe")).username || null; } catch { return null; }
}

type Chat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
type Update = { update_id: number; message?: { chat: Chat }; my_chat_member?: { chat: Chat }; channel_post?: { chat: Chat } };

// Read who has started the bot (or added it to a group) and remember them. Telegram
// keeps updates for 24 hours, so this runs on every watcher check and every time the
// Watchers page lists recipients — nobody gets missed as long as either happens daily.
export async function syncTelegramChats(): Promise<void> {
  const sb = getSupabase();
  if (!hasTelegram() || !sb) return;
  const ups = await call<Update[]>("getUpdates", { allowed_updates: ["message", "my_chat_member", "channel_post"] });
  const chats = new Map<string, Chat>();
  for (const u of ups) { const c = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat; if (c) chats.set(String(c.id), c); }
  if (!chats.size) return;
  const rows = [...chats.values()].map((c) => ({
    chat_id: String(c.id),
    name: c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.id),
    username: c.username || null,
    kind: c.type,
  }));
  await sb.from("mh_telegram_chats").upsert(rows, { onConflict: "chat_id" });
  // Confirm what was read, so Telegram doesn't hand the same updates back forever.
  const last = Math.max(...ups.map((u) => u.update_id));
  await call("getUpdates", { offset: last + 1, limit: 1 }).catch(() => {});
}

export async function sendTelegram(chatId: string, html: string): Promise<void> {
  await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}
