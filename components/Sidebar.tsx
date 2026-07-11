"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconHome, IconLayoutKanban, IconSun, IconCalendar, IconSend, IconRadar,
  IconCompass, IconHash, IconBrandInstagram, IconPhoto, IconMovie,
  IconCircleDashed, IconUsers, IconBrandLinkedin, IconBrandYoutube,
  IconBrandFacebook, IconSpeakerphone, IconSpy, IconScale, IconTarget,
  IconBriefcase, IconSparkles, IconReport, IconUsersGroup, IconLogout,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

// Grouped navigation (approved by Maheen 2026-07-11, icons per the mockup):
//   Overview on top · Content · Analytics (by platform, Instagram expandable) ·
//   Ads · Sales · AI · bottom shelf = Team + Sign out.
// All 22 original tabs preserved + the new Facebook analytics tab.

type NavLink = { label: string; href: string; icon: TablerIcon };

const CONTENT: NavLink[] = [
  { label: "Marketing Hub", href: "/dashboard/marketing-hub", icon: IconLayoutKanban },
  { label: "My Day", href: "/dashboard/my-day", icon: IconSun },
  { label: "Content Calendar", href: "/dashboard/calendar", icon: IconCalendar },
  { label: "Scheduler", href: "/dashboard/scheduler", icon: IconSend },
  { label: "Content Radar", href: "/dashboard/radar", icon: IconRadar },
  { label: "Discover", href: "/dashboard/discover", icon: IconCompass },
  { label: "Hashtags", href: "/dashboard/hashtags", icon: IconHash },
];

// Instagram's analytics pages nest under one expandable platform row.
// (Audience moved out 2026-07-12 — it's the all-platform audience tab now,
// a standalone item at the end of the Analytics group, above Ads.)
const INSTAGRAM_PAGES: NavLink[] = [
  { label: "Posts", href: "/dashboard/posts", icon: IconPhoto },
  { label: "Reels", href: "/dashboard/reels", icon: IconMovie },
  { label: "Stories", href: "/dashboard/stories", icon: IconCircleDashed },
];

const PLATFORMS: NavLink[] = [
  { label: "LinkedIn", href: "/dashboard/linkedin", icon: IconBrandLinkedin },
  { label: "YouTube", href: "/dashboard/youtube", icon: IconBrandYoutube },
  { label: "Facebook", href: "/dashboard/facebook", icon: IconBrandFacebook },
];

const ADS: NavLink[] = [
  { label: "Ads", href: "/dashboard/ads", icon: IconSpeakerphone },
  { label: "Competitor Ads", href: "/dashboard/competitors", icon: IconSpy },
  { label: "Benchmark", href: "/dashboard/benchmark", icon: IconScale },
];

const SALES: NavLink[] = [
  { label: "Leads", href: "/dashboard/leads", icon: IconTarget },
  { label: "Sales Ops", href: "/dashboard/sales-ops", icon: IconBriefcase },
];

const AI: NavLink[] = [
  { label: "AI Insights", href: "/dashboard/ai-insights", icon: IconSparkles },
  { label: "AI Reports", href: "/dashboard/ai-reports", icon: IconReport },
];

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">
      {children}
    </div>
  );
}

// The brand/account picker lives in the page header now (DashboardShell), not here.
// User note (2026-07-11): "Compare all 5 accounts" was removed but must come back
// somewhere — likely as an "All brands" scope once the multi-brand overview matures.
export function Sidebar() {
  const pathname = usePathname();

  // Role-aware: admins see the nav; members never reach /dashboard/* at all
  // (middleware bounces them), so nothing renders until /api/me confirms admin.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsAdmin(!!d?.user?.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  // Instagram platform row: expanded when you're on one of its pages, or toggled by hand.
  const igActive = INSTAGRAM_PAGES.some((p) => pathname === p.href);
  const [igOpen, setIgOpen] = useState(false);
  useEffect(() => { if (igActive) setIgOpen(true); }, [igActive]);

  const item = (t: NavLink, indent = false) => {
    const active = pathname === t.href;
    const Ico = t.icon;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${indent ? "ml-5" : ""} ${active ? "bg-brand-light text-brand font-medium" : "hover:bg-gray-50 text-gray-700"}`}
      >
        <Ico size={indent ? 15 : 17} stroke={1.7} className={active ? "text-brand" : "text-gray-400"} />
        {t.label}
      </Link>
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="text-lg font-semibold">GooCampus</div>
        <div className="text-xs text-gray-500">Marketing OS</div>
      </div>

      <nav className="px-3 pt-3 pb-2 space-y-0.5 text-sm flex-1 overflow-y-auto min-h-0">
        {isAdmin && (
          <>
            {item({ label: "Overview", href: "/dashboard", icon: IconHome })}

            <GroupHeading>Content</GroupHeading>
            {CONTENT.map((t) => item(t))}

            <GroupHeading>Analytics</GroupHeading>
            <button
              onClick={() => setIgOpen((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left ${igActive ? "text-brand font-medium" : "text-gray-800 hover:bg-gray-50"}`}
            >
              <IconBrandInstagram size={17} stroke={1.7} className={igActive ? "text-brand" : "text-gray-400"} />
              <span className="flex-1">Instagram</span>
              <span className={`text-gray-400 text-xs transition-transform ${igOpen ? "rotate-90" : ""}`}>›</span>
            </button>
            {igOpen && INSTAGRAM_PAGES.map((t) => item(t, true))}
            {PLATFORMS.map((t) => item(t))}
            {item({ label: "Audience", href: "/dashboard/audience", icon: IconUsers })}

            <GroupHeading>Ads</GroupHeading>
            {ADS.map((t) => item(t))}

            <GroupHeading>Sales</GroupHeading>
            {SALES.map((t) => item(t))}

            <GroupHeading>AI</GroupHeading>
            {AI.map((t) => item(t))}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100 space-y-0.5 text-sm">
        {isAdmin && item({ label: "Team", href: "/dashboard/team", icon: IconUsersGroup })}
        <form action="/api/logout" method="post" className="px-3 pt-1">
          <button className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900">
            <IconLogout size={14} stroke={1.7} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
