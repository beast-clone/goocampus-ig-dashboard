"use client";
import { useEffect, useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { DateRangePicker, type Range, rangeDays } from "@/components/DateRangePicker";
import { PdfExportButton } from "@/components/PdfExportButton";
import { TokenExpiryBadge } from "@/components/TokenExpiryBadge";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "@/lib/accounts";
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
  active, title, subtitle, hideAccountPicker, hideRange, children,
}: {
  active: HopeTab;
  title: string;
  subtitle?: string;
  hideAccountPicker?: boolean;
  hideRange?: boolean;   // hide the top date bar (page drives the range itself via setRange)
  children: (ctx: { accountId: string; compareAll: boolean; range: Range; setRange: (r: Range) => void }) => React.ReactNode;
}) {
  const [accountId, setAccountIdRaw] = useState(DEFAULT_ACCOUNT_ID);
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

  const setAccountId = (id: string) => {
    setAccountIdRaw(id);
    try { window.localStorage.setItem(LS_ACCOUNT, id); window.localStorage.setItem(LS_COMPARE, "0"); } catch { /* ignore */ }
  };

  const profile = useProfile();
  const effectiveAccountId = profile ?? accountId;
  const account = ACCOUNTS.find((a) => a.id === effectiveAccountId);
  const headerSub = subtitle ?? account?.handle;

  return (
    <HopeShell active={active} title={title} hideTopbar>
      <div className="hope-scope">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-3 text-[#232D42]">
              {title}
              {!hideRange && <span className="text-xs font-medium bg-brand-light text-brand rounded-full px-3 py-1">{rangeLabel(range)}</span>}
            </h1>
            {headerSub && <p className="text-sm text-gray-500 mt-1.5">{headerSub}</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!hideAccountPicker && (profile ? (
              <span className="rounded-lg bg-brand-light text-brand px-3 py-2 text-sm font-medium">{account?.label ?? profile} · profile view</span>
            ) : (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white font-medium"
              >
                {ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            ))}
            <TokenExpiryBadge />
            {!hideRange && <DateRangePicker value={range} onChange={setRange} />}
            {!hideRange && <PdfExportButton accountId={profile ?? accountId} range={range} />}
          </div>
        </div>
        {children({ accountId: profile ?? accountId, compareAll: false, range, setRange })}
      </div>
    </HopeShell>
  );
}
