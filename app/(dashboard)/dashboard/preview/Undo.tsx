"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTyping } from "./Shortcuts";

// One undo stack for the dashboard.
//
// Undo in a browser is free inside a text box and NOT free anywhere else: a change
// that has been saved is a row in Supabase, and taking it back means writing the
// opposite. So an entry carries the two things it cannot work out for itself —
// how to put it back, and how to do it again — and the screen that made the change
// supplies both, because only it knows what the change was.
//
// Deliberately NOT undoable, and never to be added here: anything that leaves the
// building. Publishing to Instagram, the watcher emails, the round-robin WhatsApp.
// Those need a confirmation BEFORE, not a regret after.
//
// My Day keeps its own stack (it had one first, with a conflict check) and calls
// suspend() while it is open, so Ctrl+Z there means what it has always meant
// instead of two handlers fighting over the same keypress.

export type UndoEntry = {
  /** What the toast says: "Priority: High → Urgent". The team's words. */
  label: string;
  /** Put it back. Return false if it refused, so the stack does not lie. */
  undo: () => Promise<boolean>;
  /** Do it again. */
  redo: () => Promise<boolean>;
};

type Ctx = {
  record: (e: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  suspend: (on: boolean) => void;
};

const UndoCtx = createContext<Ctx | null>(null);

/** Record an action so Ctrl+Z can take it back. */
export function useUndo(): Ctx {
  // A no-op outside the provider, so a component can call record() without
  // caring whether it is mounted inside the dashboard shell or a test.
  return useContext(UndoCtx) ?? { record: () => {}, undo: () => {}, redo: () => {}, suspend: () => {} };
}

/** For a screen that runs its own undo: silences the shared one while mounted. */
export function useOwnUndo() {
  const { suspend } = useUndo();
  useEffect(() => { suspend(true); return () => suspend(false); }, [suspend]);
}

const MAX = 50;

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const suspended = useRef(false);
  const busy = useRef(false);
  const [toast, setToast] = useState<{ text: string; action?: () => void; kind: "did" | "undone" | "refused" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: NonNullable<typeof toast>) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const undo = useCallback(async () => {
    // One at a time. Holding Ctrl+Z used to be a way to fire six overlapping
    // writes at the same row and get back whichever landed last.
    if (busy.current) return;
    const e = undoStack.current[undoStack.current.length - 1];
    if (!e) { show({ text: "Nothing to undo", kind: "refused" }); return; }
    busy.current = true;
    try {
      const ok = await e.undo();
      undoStack.current = undoStack.current.slice(0, -1);
      if (ok) {
        redoStack.current = [...redoStack.current, e];
        show({ text: e.label, kind: "undone" });
      }
    } finally { busy.current = false; }
  }, [show]);

  const redo = useCallback(async () => {
    if (busy.current) return;
    const e = redoStack.current[redoStack.current.length - 1];
    if (!e) { show({ text: "Nothing to redo", kind: "refused" }); return; }
    busy.current = true;
    try {
      const ok = await e.redo();
      redoStack.current = redoStack.current.slice(0, -1);
      if (ok) {
        undoStack.current = [...undoStack.current, e];
        show({ text: e.label, kind: "did" });
      }
    } finally { busy.current = false; }
  }, [show]);

  const record = useCallback((e: UndoEntry) => {
    undoStack.current = [...undoStack.current.slice(-(MAX - 1)), e];
    redoStack.current = [];   // a new change ends the old future
    // The button matters more than the shortcut: most people will never press
    // Ctrl+Z, and this is the only moment they are looking at the thing anyway.
    show({ text: e.label, kind: "did", action: () => { void undo(); } });
  }, [show, undo]);

  const suspend = useCallback((on: boolean) => { suspended.current = on; }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || suspended.current) return;
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
      // Inside a text box, Ctrl+Z is the browser's own undo of your typing, which
      // is almost always what you meant.
      if (isTyping(document.activeElement)) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey) { ev.preventDefault(); void undo(); }
      else if ((k === "z" && ev.shiftKey) || k === "y") { ev.preventDefault(); void redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <UndoCtx.Provider value={{ record, undo, redo, suspend }}>
      {children}
      {toast && <UndoToast toast={toast} onClose={() => setToast(null)} />}
    </UndoCtx.Provider>
  );
}

function UndoToast({ toast, onClose }: {
  toast: { text: string; action?: () => void; kind: "did" | "undone" | "refused" };
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const lead = toast.kind === "undone" ? "Undone" : toast.kind === "refused" ? "" : "Changed";
  return createPortal(
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm max-w-[90vw]">
      {lead && <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6]">{lead}</span>}
      <span className="text-[13px] text-[#232D42] truncate">{toast.text}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action?.(); onClose(); }}
          className="text-[12px] font-semibold text-brand hover:underline flex-shrink-0"
        >
          Undo
        </button>
      )}
      <button onClick={onClose} className="text-[#A6ACBE] hover:text-[#4A5468] text-sm leading-none flex-shrink-0">×</button>
    </div>,
    document.body,
  );
}
