"use client";
import { useState } from "react";
import { format, subDays } from "date-fns";
import { Sidebar } from "@/components/Sidebar";
import { DateRangePicker, type Range } from "@/components/DateRangePicker";
import { AIReportButton } from "@/components/AIReportButton";
import { ACCOUNTS } from "@/lib/accounts";

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (ctx: { accountId: string; compareAll: boolean; range: Range }) => React.ReactNode;
}) {
  const [accountId, setAccountId] = useState(ACCOUNTS[0].id);
  const [compareAll, setCompareAll] = useState(false);
  const [range, setRange] = useState<Range>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });

  const account = ACCOUNTS.find((a) => a.id === accountId);
  const headerTitle = compareAll ? `${title} — All Accounts` : title;
  const headerSub = compareAll ? "Cross-account comparison" : subtitle ?? account?.handle;

  return (
    <div className="flex">
      <Sidebar
        accountId={accountId}
        onAccountChange={(id) => { setAccountId(id); setCompareAll(false); }}
        onCompareAll={() => setCompareAll(true)}
      />
      <main className="flex-1 p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{headerTitle}</h1>
            <p className="text-sm text-gray-500">{headerSub}</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker value={range} onChange={setRange} />
            <AIReportButton accountId={compareAll ? "all" : accountId} range={range} />
          </div>
        </div>
        {children({ accountId: compareAll ? "all" : accountId, compareAll, range })}
      </main>
    </div>
  );
}
