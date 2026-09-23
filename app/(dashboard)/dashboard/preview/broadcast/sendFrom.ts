import type { WaAccount } from "@/lib/whatsapp-session";

// Which connected number new messages go out from.
//
// Compose picked "the first working account" silently, so with two numbers linked
// there was no way to see which one would send — and a message addressed to the
// sending number lands in its own "Message yourself" chat (23 Sep). The choice now
// lives here: shown and changeable on the Connected numbers panel, and read by the
// composer. Kept per browser, because it is a preference, not team data.

const KEY = "gc-wa-send-from";
export const SEND_FROM_CHANGED = "gc-wa-send-from-changed";

/** The stored choice, or null when nothing is stored. */
export function storedSendFrom(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** The account that will actually send: the stored one if it is still usable, else the first working one. */
export function resolveSendFrom(accounts: WaAccount[]): WaAccount | null {
  const stored = storedSendFrom();
  const usable = (a: WaAccount) => a.status === "WORKING";
  return accounts.find((a) => a.name === stored && usable(a))
    ?? accounts.find(usable)
    ?? accounts[0]
    ?? null;
}

export function setSendFrom(name: string) {
  try { localStorage.setItem(KEY, name); } catch { /* private mode — this session only */ }
  window.dispatchEvent(new Event(SEND_FROM_CHANGED));
}
