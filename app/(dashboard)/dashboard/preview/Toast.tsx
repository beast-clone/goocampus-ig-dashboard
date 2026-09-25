"use client";
import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";

// One toast for the whole dashboard.
//
// It used to live inside My Day, pinned bottom-right, where it sat underneath the
// floating Comment button and was half unreadable (Praveen, 25 Sep). Every other
// tab that wanted one had its own copy of the same idea.
//
// So it works like ConfirmDialog: callable from anywhere, rendered once by
// <ToastHost/> in the dashboard layout. Top centre, clear of the sidebar, the page
// header and the Comment button, and never more than two short lines — a toast
// nobody can read is just decoration.

export type ToastMsg = {
  /** The headline. Keep it to a few words: "Rearranged", "Duration set". */
  who: string;
  /** One short line of detail. Long text is cut rather than wrapped forever. */
  body?: string;
  /** Accent colour for the marker. */
  color?: string;
  /** A letter for the marker — usually the person's initial. */
  av?: string;
  /** Present when the toast opens something; renders the action word. */
  convo?: string;
  /** What happens on click, when there is something to open. */
  onOpen?: () => void;
};

type Shown = ToastMsg & { id: number };
let emit: ((m: Shown | null) => void) | null = null;
let seq = 0;

/** Show a toast from anywhere. Passing null clears the current one. */
export function showToast(m: ToastMsg | null) {
  if (!emit) return;
  emit(m ? { ...m, id: ++seq } : null);
}

const DWELL_MS = 4200;

export function ToastHost() {
  const [msg, setMsg] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { emit = setMsg; return () => { emit = null; }; }, []);

  // Each new message restarts the clock; the fade is short enough not to delay
  // the next one.
  useEffect(() => {
    if (!msg) return;
    setLeaving(false);
    const hide = setTimeout(() => setLeaving(true), DWELL_MS);
    const drop = setTimeout(() => setMsg(null), DWELL_MS + 220);
    return () => { clearTimeout(hide); clearTimeout(drop); };
  }, [msg]);

  if (!msg) return null;
  const clickable = !!msg.onOpen;

  return (
    <div
      className="fixed left-1/2 z-[120] w-[min(420px,calc(100vw-32px))] -translate-x-1/2"
      style={{ top: leaving ? 8 : 18, opacity: leaving ? 0 : 1, transition: "top .2s ease, opacity .2s ease" }}
      role="status" aria-live="polite"
    >
      <div
        onClick={() => { if (msg.onOpen) msg.onOpen(); setMsg(null); }}
        style={{ boxShadow: "0 10px 30px rgba(20,22,40,.14)" }}
        className={`flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 ${clickable ? "cursor-pointer hover:border-gray-200" : ""}`}
      >
        <span
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-[12px] font-semibold text-white"
          style={{ background: msg.color || "#3A57E8" }}
        >
          {msg.av || "•"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[#232D42]">{msg.who}</span>
          {msg.body && <span className="block truncate text-[12px] text-[#8A92A6]">{msg.body}</span>}
        </span>
        {clickable && <span className="flex-shrink-0 text-[12px] font-medium text-brand">Open</span>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMsg(null); }}
          className="flex-shrink-0 text-gray-300 hover:text-[#232D42]"
          aria-label="Dismiss"
        >
          <IconX size={14} stroke={2} />
        </button>
      </div>
    </div>
  );
}
