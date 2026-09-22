"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconX } from "@tabler/icons-react";

// On-screen notification pop-ups, on EVERY preview page (docs/NOTIFICATIONS_SPEC.md).
// Mounted once in the preview layout, so it survives navigation and never doubles up.
//
//   · a new notification pops up once
//   · an ACTION-NEEDED one that is ignored pops again every ~90 s, with no limit,
//     until the person clicks "Go to notification center" (read) or "Dismiss"
//   · no pop-ups in quiet hours — the server decides that, in IST
//   · the unread count goes into the browser tab title and the sidebar badge
//
// Timing lives server-side (last_popped_at), so a reload or a second open tab
// doesn't reset the clock or pop the same thing twice.

export type NotifItem = {
  id: string; kind: string; category: string; action_needed: boolean;
  emoji: string | null; title: string; sub: string | null; post_id: string | null;
  created_at: string; read_at: string | null; dismissed_at: string | null;
  last_popped_at: string | null; done_at: string | null;
};

const POLL_MS = 30_000;          // how often to look for new ones
const REPOP_MS = 90_000;         // an ignored action item comes back after this
const SHOW_MS = 15_000;          // a pop-up stays this long unless hovered
const FYI_FRESH_MS = 12 * 3_600_000; // an FYI only pops if this recent — stops a first
                                     // sync's 30-day backlog arriving as 40 pop-ups
const MAX_VISIBLE = 3;

export const NOTIF_REFRESH = "gc-notif-refresh"; // fire after changing state elsewhere
export const NOTIF_COUNT = "gc-notif-count";     // detail: { unread, action }
export const NOTIF_CENTER = "/dashboard/preview/notifications";
export const taskHref = (postId: string) => `/dashboard/preview/marketing-hub?open=${postId}`;

export async function patchNotifs(body: { op: "read" | "dismiss" | "popped" | "delete"; ids?: string[]; all?: boolean; category?: string }) {
  const r = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
}

// Should this item be on screen right now?
function wantsPop(n: NotifItem, now: number): boolean {
  if (n.read_at || n.dismissed_at) return false;
  if (n.action_needed) {
    if (n.done_at) return false;
    return !n.last_popped_at || now - new Date(n.last_popped_at).getTime() >= REPOP_MS;
  }
  return !n.last_popped_at && now - new Date(n.created_at).getTime() <= FYI_FRESH_MS;
}

export function NotificationHost() {
  const router = useRouter();
  const [shown, setShown] = useState<NotifItem[]>([]);
  const shownRef = useRef<NotifItem[]>([]);   // current stack, readable outside a state updater
  shownRef.current = shown;
  const [extra, setExtra] = useState(0);
  const hovering = useRef(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const hide = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setShown((s) => s.filter((x) => x.id !== id));
  }, []);

  const load = useCallback(async () => {
    let body: { items?: NotifItem[]; quiet?: boolean };
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      body = await r.json();
    } catch { return; }
    const items = body.items || [];

    // Unread count → tab title + sidebar badge.
    const unread = items.filter((n) => !n.read_at).length;
    const action = items.filter((n) => n.action_needed && !n.done_at && !n.read_at).length;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread ? `(${unread}) ${base}` : base;
    window.dispatchEvent(new CustomEvent(NOTIF_COUNT, { detail: { unread, action } }));

    if (body.quiet) return;
    const now = Date.now();
    const cur = shownRef.current;
    const onScreen = new Set(cur.map((x) => x.id));
    const due = items.filter((n) => !onScreen.has(n.id) && wantsPop(n, now));
    if (!due.length) return;
    // Action items first, then newest. Record that they popped so the 90 s clock
    // restarts and another open tab doesn't show them too. Kept out of the state
    // updater: React may run an updater twice, which would send this twice.
    due.sort((a, b) => Number(b.action_needed) - Number(a.action_needed) || b.created_at.localeCompare(a.created_at));
    const next = due.slice(0, Math.max(0, MAX_VISIBLE - cur.length));
    setExtra(due.length - next.length);
    if (!next.length) return;
    patchNotifs({ op: "popped", ids: next.map((n) => n.id) }).catch(() => {});
    setShown((c) => [...next.filter((n) => !c.some((x) => x.id === n.id)), ...c]);
  }, []);

  // Each pop-up hides itself after a while (unless hovered). Hidden ≠ handled:
  // an ignored action item simply pops again on a later poll.
  useEffect(() => {
    for (const n of shown) {
      if (timers.current[n.id]) continue;
      const arm = () => {
        timers.current[n.id] = setTimeout(() => {
          if (hovering.current) { arm(); return; }
          hide(n.id);
        }, SHOW_MS);
      };
      arm();
    }
  }, [shown, hide]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIF_REFRESH, onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); window.removeEventListener(NOTIF_REFRESH, onFocus); };
  }, [load]);

  const act = async (n: NotifItem, op: "read" | "dismiss", go?: string) => {
    hide(n.id);
    try { await patchNotifs({ op, ids: [n.id] }); } catch { /* the next poll shows it again */ }
    window.dispatchEvent(new Event(NOTIF_REFRESH));
    if (go) router.push(go);
  };

  if (!shown.length) return null;
  return (
    <div className="gc-notif-stack" onMouseEnter={() => { hovering.current = true; }} onMouseLeave={() => { hovering.current = false; }}
      role="region" aria-label="Notifications" aria-live="polite">
      {shown.map((n) => (
        <div key={n.id} className={`gc-notif ${n.action_needed ? "is-action" : ""}`}>
          <button type="button" className="gc-notif-body" title={n.post_id ? "Open the task" : "Open the notification center"}
            onClick={() => act(n, "read", n.post_id ? taskHref(n.post_id) : NOTIF_CENTER)}>
            <span className="gc-notif-emoji" aria-hidden>{n.emoji || "🔔"}</span>
            <span className="gc-notif-text">
              {n.action_needed && <span className="gc-notif-tag">Needs you</span>}
              <span className="gc-notif-title">{n.title}</span>
              {n.sub && <span className="gc-notif-sub">{n.sub}</span>}
            </span>
          </button>
          <button type="button" className="gc-notif-x" aria-label="Dismiss" onClick={() => act(n, "dismiss")}><IconX size={15} stroke={1.8} /></button>
          <div className="gc-notif-actions">
            <button type="button" className="gc-notif-go" onClick={() => act(n, "read", NOTIF_CENTER)}>
              <IconBell size={14} stroke={1.8} /> Go to notification center
            </button>
            <button type="button" className="gc-notif-dismiss" onClick={() => act(n, "dismiss")}>Dismiss</button>
          </div>
        </div>
      ))}
      {extra > 0 && (
        <button type="button" className="gc-notif-more" onClick={() => { setShown([]); setExtra(0); router.push(NOTIF_CENTER); }}>
          +{extra} more in the notification center
        </button>
      )}
    </div>
  );
}

// Styles live with the component (the preview shell injects its CSS the same way).
export const NOTIF_CSS = `
.gc-notif-stack{position:fixed;top:76px;right:20px;z-index:60;width:360px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;gap:10px}
.gc-notif{position:relative;background:#fff;border:1px solid #E6E9F2;border-left:3px solid #3A57E8;border-radius:12px;box-shadow:0 12px 32px rgba(35,45,66,.14);padding:12px 12px 10px;animation:gcNotifIn .22s ease-out}
.gc-notif.is-action{border-left-color:#C2410C}
.gc-notif-body{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;padding:0 22px 0 0;cursor:pointer;font:inherit}
.gc-notif-emoji{font-size:18px;line-height:1.2;flex-shrink:0}
.gc-notif-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.gc-notif-tag{align-self:flex-start;font-size:10.5px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:#C2410C;background:#FFF1E8;border-radius:999px;padding:1px 7px;margin-bottom:2px}
.gc-notif-title{font-size:14px;font-weight:500;color:#232D42;line-height:1.35}
.gc-notif-sub{font-size:12.5px;color:#8A92A6;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.gc-notif-x{position:absolute;top:8px;right:8px;border:0;background:none;color:#8A92A6;cursor:pointer;padding:3px;border-radius:6px;line-height:0}
.gc-notif-x:hover{color:#232D42;background:#F6F7FB}
.gc-notif-actions{display:flex;gap:6px;margin-top:10px;padding-left:28px}
.gc-notif-go{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:8px;border:0;background:#3A57E8;color:#fff;font-size:12.5px;font-weight:500;cursor:pointer}
.gc-notif-go:hover{background:#2138B0}
.gc-notif-dismiss{height:30px;padding:0 10px;border-radius:8px;border:1px solid #E6E9F2;background:#fff;color:#4A5468;font-size:12.5px;font-weight:500;cursor:pointer}
.gc-notif-dismiss:hover{border-color:#3A57E8;color:#3A57E8}
.gc-notif-more{align-self:flex-end;border:1px solid #E6E9F2;background:#fff;color:#3A57E8;font-size:12.5px;font-weight:500;border-radius:999px;padding:5px 12px;cursor:pointer}
@keyframes gcNotifIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gc-notif{animation:none}}
html[data-theme="dark"] .gc-notif,html[data-theme="dark"] .gc-notif-more,html[data-theme="dark"] .gc-notif-dismiss{background:var(--d-card);border-color:var(--d-line)}
html[data-theme="dark"] .gc-notif{box-shadow:0 12px 32px rgba(0,0,0,.45)}
html[data-theme="dark"] .gc-notif-title{color:var(--d-ink)}
html[data-theme="dark"] .gc-notif-sub,html[data-theme="dark"] .gc-notif-x{color:var(--d-muted)}
html[data-theme="dark"] .gc-notif-x:hover{background:var(--d-raised);color:var(--d-ink)}
html[data-theme="dark"] .gc-notif-dismiss{color:var(--d-ink2)}
html[data-theme="dark"] .gc-notif-more{color:var(--d-brand-text)}
html[data-theme="dark"] .gc-notif-tag{background:rgba(194,65,12,.18);color:#F59E6B}
`;
