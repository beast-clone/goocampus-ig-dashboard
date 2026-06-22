"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCOUNTS } from "@/lib/accounts";

const NAV = [
  { label: "Overview", href: "/dashboard" },
  { label: "Posts", href: "/dashboard/posts" },
  { label: "Reels", href: "/dashboard/reels" },
  { label: "Stories", href: "/dashboard/stories" },
  { label: "Audience", href: "/dashboard/audience" },
  { label: "AI Reports", href: "/dashboard/ai-reports" },
];

export function Sidebar({ accountId, onAccountChange, onCompareAll }: {
  accountId: string;
  onAccountChange: (id: string) => void;
  onCompareAll: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="text-lg font-semibold">GooCampus</div>
        <div className="text-xs text-gray-500">Instagram Analytics</div>
      </div>

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

      <nav className="px-3 py-2 space-y-1 text-sm">
        {NAV.map((t) => {
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
