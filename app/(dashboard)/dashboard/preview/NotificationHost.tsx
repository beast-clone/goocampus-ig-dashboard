"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconX } from "@tabler/icons-react";
import { NotifIcon } from "@/app/(dashboard)/dashboard/preview/NotifIcon";

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
      // localStorage "gc-notif-ignore-quiet" = "1" asks the API to skip quiet hours;
      // the API only honours it on a local dev server.
      const ignoreQuiet = typeof localStorage !== "undefined" && localStorage.getItem("gc-notif-ignore-quiet") === "1";
      const r = await fetch(`/api/notifications${ignoreQuiet ? "?ignoreQuiet=1" : ""}`, { cache: "no-store" });
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
            <NotifIcon emoji={n.emoji} actionNeeded={n.action_needed} size={16} />
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
