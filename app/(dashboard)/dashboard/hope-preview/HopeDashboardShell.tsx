"use client";
import { useEffect, useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { DateRangePicker, type Range, rangeDays } from "@/components/DateRangePicker";
import { PdfExportButton } from "@/components/PdfExportButton";
import { TokenExpiryBadge } from "@/components/TokenExpiryBadge";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "@/lib/accounts";
import { HopeSelect } from "./HopeSelect";
import { useProfile } from "@/lib/profile";
import { HopeShell, type HopeTab } from "./HopeShell";

// Hope-UI (Version 2) drop-in replacement for the V1 `DashboardShell`. It exposes
// the EXACT same render-prop API — children receive { accountId, compareAll, range } —
// so any V1 page can be cloned into hope-preview/<tab>/ by swapping the import and
// adding `active`, with zero changes to the page's sections. It renders the Hope
// sidebar + a Hope-styled header (account picker + date range + badges), and wraps
// the whole thing in `.hope-scope` so every reused V1 section recolours violet→Hope
// blue. V1 (`components/DashboardShell.tsx`) is untouched.
const LS_ACCOUNT = "gc-dash:accountId";
const LS_COMPARE = "gc-dash:compareAll";

function rangeLabel(r: Range): string {
  const days = rangeDays(r);
  const today = format(new Date(), "yyyy-MM-dd");
  const isToToday = r.to === today;
  if (isToToday && days === 7) return "Last 7 days";
  if (isToToday && days === 30) return "Last 30 days";
  if (isToToday && days === 90) return "Last 90 days";
  if (isToToday && days === 180) return "Last 6 months";
  if (isToToday && days === 365) return "Last 1 year";
  const fromStr = format(parseISO(r.from), "d MMM");
  const toStr = format(parseISO(r.to), "d MMM yyyy");
  return `${fromStr} – ${toStr} (${days} days)`;
}

export function HopeDashboardShell({
  active, title, subtitle, hideAccountPicker, hideRange, compact, children,
}: {
  active: HopeTab;
  title: string;
  subtitle?: string;
  hideAccountPicker?: boolean;
  hideRange?: boolean;   // hide the top date bar (page drives the range itself via setRange)
  // Slimmer hero for drill-down pages. A full-height band is right for a landing
  // page you arrive at; on a sub-page you clicked into deliberately it just pushes
  // the thing you came to read below the fold.
  compact?: boolean;
  children: (ctx: { accountId: string; compareAll: boolean; range: Range; setRange: (r: Range) => void }) => React.ReactNode;
}) {
  const [accountId, setAccountIdRaw] = useState(DEFAULT_ACCOUNT_ID);
  // Real Instagram profile pictures for the account picker (accountId -> data URI).
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [range, setRange] = useState<Range>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedAccount = window.localStorage.getItem(LS_ACCOUNT);
      if (savedAccount && ACCOUNTS.some((a) => a.id === savedAccount)) setAccountIdRaw(savedAccount);
      window.localStorage.setItem(LS_COMPARE, "0");
    } catch { /* private-mode — fall back to defaults */ }
  }, []);

  // Pull the accounts' real IG logos once; the picker falls back to text-only
  // until they arrive (and per-image if a load fails). Skipped in profile view.
  useEffect(() => {
    if (hideAccountPicker) return;
    let alive = true;
    fetch("/api/account-avatars")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.avatars) setAvatars(j.avatars as Record<string, string>); })
      .catch(() => { /* text-only picker */ });
    return () => { alive = false; };
  }, [hideAccountPicker]);

  const setAccountId = (id: string) => {
    setAccountIdRaw(id);
    try { window.localStorage.setItem(LS_ACCOUNT, id); window.localStorage.setItem(LS_COMPARE, "0"); } catch { /* ignore */ }
  };

  const profile = useProfile();
  const effectiveAccountId = profile ?? accountId;
  const account = ACCOUNTS.find((a) => a.id === effectiveAccountId);
  const headerSub = subtitle ?? account?.handle;

  // A control bar shows only if there's something in it (range and/or account).
  const showControls = !hideRange || !hideAccountPicker;

  return (
    <HopeShell active={active} title={title} hideTopbar>
      <div className="hope-scope">
        {/* Brand hero band — uniform across every tab (mirrors the Publishing Calendar).
            Extra bottom padding only when a white control card overlaps it. */}
        <div
          className={`relative overflow-hidden rounded-2xl text-white ${
            compact ? "px-6 pt-4" : "px-7 pt-6"} ${
            showControls ? (compact ? "pb-12" : "pb-16") : (compact ? "pb-4 mb-4" : "pb-6 mb-6")}`}
          style={{ background: "linear-gradient(115deg,#3A57E8 0%,#4A64EA 45%,#6B7CF2 100%)" }}
        >
          <div className="relative z-10">
            {/* Inline colour: .hope-scope forces heading colour dark, so force white here. */}
            <h1 className={`hope-hero-h1 leading-tight tracking-tight ${compact ? "text-[1.25rem]" : "text-[1.7rem]"}`} style={{ fontWeight: 700, color: "#fff" }}>{title}</h1>
            {headerSub && <p className={compact ? "mt-0.5 text-[12.5px]" : "mt-1.5 text-sm"} style={{ color: "rgba(255,255,255,0.85)" }}>{headerSub}</p>}
          </div>
          <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(255,255,255,.16),transparent 62%)" }} />
          <div className="pointer-events-none absolute right-28 -bottom-24 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle,rgba(255,255,255,.10),transparent 62%)" }} />
        </div>

        {/* White control card, pulled up to overlap the band (matches the calendar). */}
        {showControls && (
          <div className={`relative z-10 mx-1 flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-gray-100 bg-white px-5 ${
            compact ? "-mt-8 mb-4 py-2" : "-mt-10 mb-6 py-3"}`}>
            <div className="flex items-center gap-2 min-h-[38px]">
              {!hideRange && <span className="text-xs font-medium bg-brand-light text-brand rounded-full px-3 py-1">{rangeLabel(range)}</span>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {!hideAccountPicker && (profile ? (
                <span className="rounded-lg bg-brand-light text-brand px-3 py-2 text-sm font-medium">{account?.label ?? profile} · profile view</span>
              ) : (
                <HopeSelect
                  value={accountId}
                  onChange={setAccountId}
                  options={ACCOUNTS.map((a) => ({ value: a.id, label: a.label, img: avatars[a.id] }))}
                />
              ))}
              <TokenExpiryBadge />
              {!hideRange && <DateRangePicker value={range} onChange={setRange} />}
              {!hideRange && <PdfExportButton accountId={profile ?? accountId} range={range} />}
            </div>
          </div>
        )}

        {children({ accountId: profile ?? accountId, compareAll: false, range, setRange })}
      </div>
    </HopeShell>
  );
}
