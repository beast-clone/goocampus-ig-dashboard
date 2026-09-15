"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Lets a page put something into the shell's top bar, beside the token badge and
// range picker.
//
// The bar belongs to PreviewDashboardShell, but the things worth putting in it —
// a live/stale indicator, a refresh button — are driven by state that only exists
// inside the page, which the shell renders below the bar via a render prop. A
// prop cannot travel that direction, so the page portals into a slot instead.
//
// Renders nothing until mounted: the slot element does not exist during SSR, and
// reaching for it then is a hydration mismatch.
export const HEADER_SLOT_ID = "preview-header-slot";

export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The shell mounts in the same commit, so the node is there by the time
    // effects run. Re-checked on every render of this component so a page that
    // mounts before the shell (or after a tab switch) still finds it.
    setHost(document.getElementById(HEADER_SLOT_ID));
  }, []);
  if (!host) return null;
  return createPortal(children, host);
}
