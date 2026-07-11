"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCOUNTS } from "@/lib/accounts";

const NAV = [
  { label: "Overview", href: "/dashboard" },
  { label: "Posts", href: "/dashboard/posts" },
  { label: "Reels", href: "/dashboard/reels" },
  { label: "Stories", href: "/dashboard/stories" },
  { label: "Audience", href: "/dashboard/audience" },
  { label: "Scheduler", href: "/dashboard/scheduler" },
  { label: "Content Calendar", href: "/dashboard/calendar" },
  { label: "Content Radar", href: "/dashboard/radar" },
  { label: "Hashtags", href: "/dashboard/hashtags" },
  { label: "Discover", href: "/dashboard/discover" },
  { label: "Leads", href: "/dashboard/leads" },
  { label: "Sales Ops", href: "/dashboard/sales-ops" },
  { label: "Marketing Hub", href: "/dashboard/marketing-hub" },
  { label: "My Day", href: "/dashboard/my-day" },
  { label: "LinkedIn", href: "/dashboard/linkedin" },
  { label: "YouTube", href: "/dashboard/youtube" },
  { label: "Ads", href: "/dashboard/ads" },
  { label: "Competitor Ads", href: "/dashboard/competitors" },
  { label: "Benchmark", href: "/dashboard/benchmark" },
  { label: "AI Insights", href: "/dashboard/ai-insights" },
  { label: "AI Reports", href: "/dashboard/ai-reports" },
  { label: "Team", href: "/dashboard/team" },
];

// Must mirror the member-allowed routes in middleware.ts — members are bounced
// to /me from every /dashboard/* page except these, so only show them these.
const MEMBER_NAV = [
  { label: "Marketing Hub", href: "/dashboard/marketing-hub" },
];

export function Sidebar({ accountId, onAccountChange, onCompareAll }: {
  accountId: string;
  onAccountChange: (id: string) => void;
  onCompareAll: () => void;
}) {
  const pathname = usePathname();

  // Role-aware nav: admins see everything; members only see the pages middleware
  // actually lets them open (everything else would just bounce them to /me).
  // null = still loading — render no nav items yet so members never see a flash
  // of the full admin menu.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsAdmin(!!d?.user?.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  const nav = isAdmin === null ? [] : isAdmin ? NAV : MEMBER_NAV;

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="text-lg font-semibold">GooCampus</div>
        <div className="text-xs text-gray-500">Instagram Analytics</div>
      </div>

      {isAdmin && (
        <div className="px-5 py-4 space-y-3">
          <label className="text-xs font-medium text-gray-500 uppercase">Account</label>
          <select
            value={accountId}
            onChange={(e) => onAccountChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
          >
            {ACCOUNTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>

          <button
            onClick={onCompareAll}
            className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-brand bg-brand-light hover:bg-brand/20"
          >
            Compare all 5 accounts
          </button>
        </div>
      )}

      {isAdmin === false && (
        <div className="px-3 pt-4">
          <Link
            href="/me"
            className="block px-3 py-2 rounded-lg text-sm font-medium text-brand bg-brand-light hover:bg-brand/20"
          >
            ← My dashboard
          </Link>
        </div>
      )}

      <nav className="px-3 py-2 space-y-1 text-sm flex-1 overflow-y-auto min-h-0">
        {nav.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`block px-3 py-2 rounded-lg ${active ? "bg-brand-light text-brand font-medium" : "hover:bg-gray-50 text-gray-700"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4 border-t border-gray-100">
        <form action="/api/logout" method="post">
          <button className="text-xs text-gray-500 hover:text-gray-900">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
