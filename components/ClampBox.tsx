"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Keeps a long section to a fixed height with its own scroll and a "Show full text"
// toggle, so everything below it stays in view. "No matter how long the content or
// the section is, every section should be clearly visible" (Praveen, 21 Oct).
// Short content renders exactly as before — no box, no button.
export function ClampBox({ maxHeight = 320, children }: { maxHeight?: number; children: ReactNode }) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight > maxHeight + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);
  return (
    <div>
      <div style={over && !open ? { maxHeight, overflowY: "auto", overflowX: "hidden" } : undefined}>
        <div ref={inner}>{children}</div>
      </div>
      {(over || open) && (
        <button type="button" onClick={() => setOpen((x) => !x)}
          style={{ marginTop: 6, border: 0, background: "none", padding: 0, fontSize: 12.5, fontWeight: 500, color: "#3A57E8", cursor: "pointer" }}>
          {open ? "Show less" : "Show full text"}
        </button>
      )}
    </div>
  );
}
