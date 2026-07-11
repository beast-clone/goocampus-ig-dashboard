"use client";
import { useEffect, useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { Sidebar } from "@/components/Sidebar";
import { DateRangePicker, type Range, rangeDays } from "@/components/DateRangePicker";
import { PdfExportButton } from "@/components/PdfExportButton";
import { TokenExpiryBadge } from "@/components/TokenExpiryBadge";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "@/lib/accounts";

// Persist the account picker across tab navigation. Each tab re-mounts the
// DashboardShell, so without this the selection would reset to the default
// every time the user clicks a sidebar item.
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

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (ctx: { accountId: string; compareAll: boolean; range: Range }) => React.ReactNode;
}) {
  const [accountId, setAccountIdRaw] = useState(DEFAULT_ACCOUNT_ID);
  const [compareAll, setCompareAllRaw] = useState(false);
  const [range, setRange] = useState<Range>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });

  // Hydrate from localStorage on mount (client-only — SSR sees the defaults).
  // Reading is done in an effect so the server render matches the client's first
  // render; the value snaps to the stored one after mount without a hydration warning.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedAccount = window.localStorage.getItem(LS_ACCOUNT);
      if (savedAccount && ACCOUNTS.some((a) => a.id === savedAccount)) {
        setAccountIdRaw(savedAccount);
      }
      // "Compare all" UI was removed (2026-07-11) — clear any stale stored flag so
      // nobody gets stuck in compare mode with no control to leave it.
      window.localStorage.setItem(LS_COMPARE, "0");
    } catch { /* private-mode or storage full — fall back to defaults */ }
  }, []);

  // Wrap the setters so every change also persists to localStorage.
  const setAccountId = (id: string) => {
    setAccountIdRaw(id);
    try { window.localStorage.setItem(LS_ACCOUNT, id); window.localStorage.setItem(LS_COMPARE, "0"); } catch { /* ignore */ }
  };
  const setCompareAll = (v: boolean) => {
    setCompareAllRaw(v);
    try { window.localStorage.setItem(LS_COMPARE, v ? "1" : "0"); } catch { /* ignore */ }
  };

  const account = ACCOUNTS.find((a) => a.id === accountId);
  const headerTitle = compareAll ? `${title} — All Accounts` : title;
  const headerSub = compareAll ? "Cross-account comparison" : subtitle ?? account?.handle;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-3">
              {headerTitle}
              <span className="text-xs font-medium bg-brand-light text-brand rounded-full px-3 py-1">
                {rangeLabel(range)}
              </span>
            </h1>
            <p className="text-sm text-gray-500">{headerSub}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Brand scope — moved here from the sidebar (2026-07-11). Picking a
                brand scopes the whole page to it. */}
            <select
              value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setCompareAll(false); }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white font-medium"
            >
              {ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <TokenExpiryBadge />
            <DateRangePicker value={range} onChange={setRange} />
            <PdfExportButton accountId={compareAll ? "all" : accountId} range={range} />
          </div>
        </div>
        {children({ accountId: compareAll ? "all" : accountId, compareAll, range })}
      </main>
    </div>
  );
}
