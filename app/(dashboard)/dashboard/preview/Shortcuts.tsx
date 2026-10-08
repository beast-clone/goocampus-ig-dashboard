"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { NewTaskDialog } from "@/components/new-task/NewTaskDialog";

// Keyboard shortcuts, and the card that tells you they exist.
//
// Mounted once in the sidebar, so it is on every page of the dashboard. Two
// existing shortcuts are deliberately NOT re-implemented here — Ctrl+Space / ⌘K
// for search lives in GlobalSearch, and ⌘Z / Ctrl+Z for undo lives in My Day —
// because moving them would be a rewrite, not a shortcut. They are listed on the
// card so the team sees one list rather than three.
//
// Single letters only work when you are NOT typing. Anything else would make the
// letter "n" impossible to type into a caption, which is the usual way this kind
// of thing goes wrong.

const HUB = "/dashboard/preview";

type Jump = { key: string; label: string; href: string };

// "g then d" rather than a modifier: Ctrl+1..4 and Ctrl+N belong to the browser,
// and this is the pattern people already know from Gmail and GitHub.
const JUMPS: Jump[] = [
  { key: "d", label: "My Day", href: `${HUB}/my-day` },
  { key: "m", label: "Master sheet", href: `${HUB}/marketing-hub?tab=master` },
  { key: "c", label: "Content calendar", href: `${HUB}/marketing-hub?tab=calendar` },
  { key: "r", label: "Content Radar", href: `${HUB}/radar` },
  { key: "v", label: "Content Review", href: `${HUB}/content-review` },
  { key: "s", label: "Scheduler", href: `${HUB}/scheduler` },
  { key: "w", label: "Watchers", href: `${HUB}/watchers` },
  { key: "o", label: "Overview", href: HUB },
];

/** Typing? Then a bare letter is a letter, not a command. */
export function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || n.isContentEditable === true;
}

export function Shortcuts() {
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [newTask, setNewTask] = useState(false);
  // "g" on its own means nothing; it is the first half of a pair. It lapses after
  // a moment so a stray g does not silently swallow the next letter you press.
  const pendingG = useRef<number>(0);

  const close = useCallback(() => { setSheet(false); setNewTask(false); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Esc closes what this component opened. Everything else owns its own Esc.
      if (e.key === "Escape") { if (sheet || newTask) { e.preventDefault(); close(); } return; }

      if (isTyping(e.target) || e.altKey) return;

      // ? is Shift+/ on most layouts, so it arrives with shiftKey set. Allowed.
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setSheet((v) => !v); return;
      }
      // Ctrl+/ — an alias for the search palette, because people reach for it.
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
        return;
      }
      if (e.metaKey || e.ctrlKey) return;   // leave every other combo to the browser

      const k = e.key.toLowerCase();

      // Second half of "g …".
      if (pendingG.current && Date.now() - pendingG.current < 1500) {
        pendingG.current = 0;
        const jump = JUMPS.find((j) => j.key === k);
        if (jump) { e.preventDefault(); close(); router.push(jump.href); }
        return;
      }
      if (k === "g") { pendingG.current = Date.now(); return; }

      if (k === "n") { e.preventDefault(); setSheet(false); setNewTask(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, sheet, newTask, close]);

  return (
    <>
      {newTask && <NewTaskDialog onClose={() => setNewTask(false)} onCreated={() => setNewTask(false)} />}
      {sheet && <CheatSheet onClose={() => setSheet(false)} />}
    </>
  );
}

// ── the card ────────────────────────────────────────────────────────────────
// Everything the dashboard answers to, in one place, including the two that live
// in other files. A shortcut nobody can find is not a shortcut.

type Row = { keys: string[]; what: string };
type Group = { title: string; note?: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: ["?"], what: "Show this card" },
      { keys: ["Ctrl", "Space"], what: "Ask / search" },
      { keys: ["Ctrl", "K"], what: "Ask / search" },
      { keys: ["N"], what: "New task" },
      { keys: ["Ctrl", "D"], what: "Dictate into the box you are typing in" },
      { keys: ["Ctrl", "Enter"], what: "Post a comment, save a note" },
      { keys: ["Esc"], what: "Close what is open" },
    ],
  },
  {
    title: "Go to",
    note: "Press G, then the letter.",
    rows: JUMPS.map((j) => ({ keys: ["G", j.key.toUpperCase()], what: j.label })),
  },
  {
    title: "Content calendar",
    rows: [
      { keys: ["←"], what: "Previous month, week or day" },
      { keys: ["→"], what: "Next month, week or day" },
      { keys: ["T"], what: "Back to today" },
      { keys: ["M"], what: "Month view" },
      { keys: ["W"], what: "Week view" },
      { keys: ["D"], what: "Day view" },
      { keys: ["L"], what: "List view" },
    ],
  },
  {
    title: "My Day",
    note: "Undo works on status changes, drag-to-reschedule and durations.",
    rows: [
      { keys: ["Ctrl", "Z"], what: "Undo" },
      { keys: ["Ctrl", "Y"], what: "Redo" },
      { keys: ["Ctrl", "Shift", "Z"], what: "Redo" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-gray-200 bg-[#F6F7FB] text-[11px] font-semibold text-[#4A5468]">
      {children}
    </kbd>
  );
}

// Rendered into <body>, not where it sits in the tree.
//
// This component is mounted inside the sidebar, because that is the one element
// present on every page — but the sidebar makes its own stacking context, so a
// fixed overlay declared inside it still painted UNDERNEATH the calendar and the
// New task button however high its z-index went. A portal is how the rest of this
// dashboard puts modals on top, and it is the only thing that actually works here.
function CheatSheet({ onClose }: { onClose: () => void }) {
  // Mac writes ⌘ where Windows writes Ctrl. Read once from the browser rather
  // than showing both and making every line twice as long.
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const label = (k: string) => (k === "Ctrl" ? (isMac ? "⌘" : "Ctrl") : k === "Shift" && isMac ? "⇧" : k);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[#232D42]/55 flex items-start justify-center p-6 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-3xl mt-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-light rounded-t-2xl">
          <div>
            <div className="text-[#232D42] font-semibold text-sm">Keyboard shortcuts</div>
            <div className="text-xs text-[#8A92A6]">Letters work when you are not typing in a box.</div>
          </div>
          <button onClick={onClose} className="text-xs font-semibold text-brand hover:underline">Close (Esc)</button>
        </div>
        <div className="p-6 grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-2">{g.title}</div>
              {g.note && <div className="text-[12px] text-[#8A92A6] mb-2">{g.note}</div>}
              <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                {g.rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {r.keys.map((k, n) => (
                        <span key={n} className="flex items-center gap-1">
                          {n > 0 && <span className="text-[10px] text-[#A6ACBE]">{g.title === "Go to" ? "then" : "+"}</span>}
                          <Key>{label(k)}</Key>
                        </span>
                      ))}
                    </span>
                    <span className="text-[13px] text-[#4A5468]">{r.what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
