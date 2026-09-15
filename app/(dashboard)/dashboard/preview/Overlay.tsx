"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders a full-screen overlay into <body>.
//
// A modal declared inside the page cannot reliably sit above the shell's control
// card, which is `relative z-10` and therefore its own stacking context: the
// modal's z-50 only ranks it among its siblings, so the header card paints over
// the top of it and clips the dialog's title. Raising the number does not help —
// the comparison never happens at that level. Taking the overlay out of the
// page's stacking context entirely does.
//
// Same fix, and the same reason, as the ⌘K palette being painted over by the
// sticky sidebar.
export function Overlay({ onClose, className, children }: {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      className={className ?? "fixed inset-0 bg-black/40 z-[300] flex items-start justify-center p-6 overflow-auto"}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}
