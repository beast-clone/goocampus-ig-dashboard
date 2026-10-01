"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconX } from "@tabler/icons-react";
import { NotifIcon } from "@/app/(dashboard)/dashboard/preview/NotifIcon";
import { playChatChime } from "@/app/(dashboard)/dashboard/preview/notifChime";

// On-screen notification pop-ups, on EVERY preview page (docs/NOTIFICATIONS_SPEC.md).
// Mounted once in the preview layout, so it survives navigation and never doubles up.
//
//   · ONLY an action-needed notification pops up. Anything that merely informs
//     goes to the bell — it rings and shakes — and to the unread count
//   · an action item that is ignored pops again every ~90 s, with no limit,
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
  /** href: where "Open" goes when there is no task (a saved Radar reminder). */
  payload?: { href?: string } | null;
};

const POLL_MS = 30_000;          // how often to look for new ones
const REPOP_MS = 90_000;         // an ignored action item comes back after this
const SHOW_MS = 15_000;          // a pop-up stays this long unless hovered
const MAX_VISIBLE = 3;

export const NOTIF_REFRESH = "gc-notif-refresh"; // fire after changing state elsewhere
export const NOTIF_COUNT = "gc-notif-count";     // detail: { unread, action }
export const NOTIF_CENTER = "/dashboard/preview/notifications";
// tab=master matters: without it the task modal opens over the Workload view, which is
// a day-capacity planner — so closing the modal leaves you on somebody's timeline
// rather than on the task you just opened.
export const taskHref = (postId: string) => `/dashboard/preview/marketing-hub?tab=master&open=${postId}`;

export async function patchNotifs(body: { op: "read" | "dismiss" | "popped" | "delete"; ids?: string[]; all?: boolean; category?: string }) {
  const r = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
}

// Should this item be on screen right now?
//
// ONLY things that need a decision. An FYI — "your task is approved", "your task
// is published" — used to pop as well, and for whoever creates the tasks that is
// every status change in the company: Maheen had 30 of them, 29 unread, three
// stacked over the page at a time (28 Sep). They are news, not a question, so they
// go to the bell and the count and nowhere else.
function wantsPop(n: NotifItem, now: number): boolean {
  if (n.read_at || n.dismissed_at) return false;
  // One exception: a competitor announcing a webinar or event pops up ONCE — the
  // whole point of watching them is to hear about it straight away (Praveen, 29 Sep).
  // It never re-pops: it's news, not something waiting on you.
  // Same for a Watcher finding a new counselling notice (1 Oct).
  if (n.kind === "competitor_event" || n.kind === "watcher_news") return !n.last_popped_at;
  if (!n.action_needed) return false;
  if (n.done_at) return false;
  return !n.last_popped_at || now - new Date(n.last_popped_at).getTime() >= REPOP_MS;
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

  // A message in the team chat, heard from ANY tab — the chat panel itself only
  // exists in My Day, so before this you had to be sitting on that page to know
  // someone had written to you (Praveen, 28 Sep).
  //
  // This host is already mounted once in the layout and already polling, so it is
  // the natural place for it. It tracks the newest message id it has seen rather
  // than the unread count: read-state lives in My Day's own storage, and copying
  // that here would be two things to keep in step.
  useEffect(() => {
    const SEEN = "gc-chat-last-seen";
    let alive = true;
    let me = "";
    const tick = async () => {
      try {
        if (!me) {
          const who = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
          me = (who?.user?.id || "").toLowerCase();
          if (!me) return;
        }
        const d = await fetch("/api/my-day/chat", { cache: "no-store" }).then((r) => r.json());
        const msgs = (d.messages || []) as { id: string; sender: string }[];
        if (!msgs.length || !alive) return;
        const newest = msgs[msgs.length - 1];
        const seen = localStorage.getItem(SEEN);
        localStorage.setItem(SEEN, newest.id);
        // First run on a device has nothing to compare against — remember where we
        // came in, and stay quiet. Your own messages never ring.
        if (!seen || seen === newest.id) return;
        if ((newest.sender || "").toLowerCase() === me) return;
        playChatChime();
      } catch { /* the chat is a nicety here; never let it break the bell */ }
    };
    tick();
    const id = setInterval(() => { if (!document.hidden) tick(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

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
