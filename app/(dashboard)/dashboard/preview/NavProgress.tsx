"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Top navigation progress bar. Shows a slim brand-indigo bar the instant you click
// a tab, eases forward while the next route loads, and completes when the new page
// is ready — so switching tabs never looks "stuck" on the old page, even when the
// destination takes a few seconds. Dependency-free; detects nav start by catching
// internal link clicks (capture phase) and nav end via usePathname changing.
export function NavProgress() {
  const pathname = usePathname();
  const [w, setW] = useState(0);
  const [show, setShow] = useState(false);
  const timers = useRef<number[]>([]);
  const first = useRef(true);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  const at = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms) as unknown as number);
  };

  const start = () => {
    clearTimers();
    setShow(true);
    setW(10);
    at(() => setW(40), 120);
    at(() => setW(65), 400);
    at(() => setW(82), 1000);
    at(() => setW(90), 3000);
  };
  const done = () => {
    clearTimers();
    setW(100);
    at(() => setShow(false), 220);
    at(() => setW(0), 450);
  };

  // Nav START — a plain left-click on an internal <a> to a different route.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || a.getAttribute("target") === "_blank") return;
      const destPath = href.split("#")[0].split("?")[0];
      if (destPath === window.location.pathname) {
        // same page (hash / query-only tweak) — a brief blip so the click is acknowledged
        start();
        at(done, 400);
        return;
      }
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // Nav END — the route actually changed.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        insetInline: 0,
        top: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: show ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${w}%`,
          background: "linear-gradient(90deg, #3A57E8, #7488F1)",
          boxShadow: "0 0 10px rgba(58,87,232,0.55)",
          borderRadius: "0 2px 2px 0",
          transition: "width 320ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
