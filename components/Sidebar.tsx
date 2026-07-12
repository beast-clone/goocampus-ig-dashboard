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

// Grouped navigation (Maheen, 2026-07-12):
//   Overview · CONTENT · ANALYTICS (each platform is a folder with its own
//   Audience inside; Instagram also has Posts/Reels/Stories) · AUDIENCE
//   (the collective all-platform page) · ADS · SALES · AI · Team + Sign out.
// Per-platform audience links use URL hashes (/dashboard/audience#youtube) —
// the Audience page reads the hash to open the right platform view.

type NavLink = { label: string; href: string; icon: TablerIcon };
type Folder = { key: string; label: string; icon: TablerIcon; href?: string; children: NavLink[] };

const CONTENT: NavLink[] = [
  { label: "Marketing Hub", href: "/dashboard/marketing-hub", icon: IconLayoutKanban },
  { label: "My Day", href: "/dashboard/my-day", icon: IconSun },
  { label: "Content Calendar", href: "/dashboard/calendar", icon: IconCalendar },
  { label: "Scheduler", href: "/dashboard/scheduler", icon: IconSend },
  { label: "Content Radar", href: "/dashboard/radar", icon: IconRadar },
  { label: "Discover", href: "/dashboard/discover", icon: IconCompass },
  { label: "Hashtags", href: "/dashboard/hashtags", icon: IconHash },
];

// Analytics platform folders. Instagram's parent row is a pure toggle (it has
// no single page); the other platforms' parent rows link to their deep-dive
// page and the chevron reveals their Audience.
const PLATFORM_FOLDERS: Folder[] = [
  {
    key: "instagram", label: "Instagram", icon: IconBrandInstagram,
    children: [
      { label: "Posts", href: "/dashboard/posts", icon: IconPhoto },
      { label: "Reels", href: "/dashboard/reels", icon: IconMovie },
      { label: "Stories", href: "/dashboard/stories", icon: IconCircleDashed },
      { label: "Audience", href: "/dashboard/audience#instagram", icon: IconUsers },
    ],
  },
  {
    key: "linkedin", label: "LinkedIn", icon: IconBrandLinkedin, href: "/dashboard/linkedin",
    children: [
      { label: "Posts", href: "/dashboard/linkedin/posts", icon: IconPhoto },
      { label: "Audience", href: "/dashboard/audience#linkedin", icon: IconUsers },
    ],
  },
  {
    key: "youtube", label: "YouTube", icon: IconBrandYoutube, href: "/dashboard/youtube",
    children: [
      { label: "Long-form", href: "/dashboard/youtube/videos#longform", icon: IconMovie },
      { label: "Shorts", href: "/dashboard/youtube/videos#shorts", icon: IconCircleDashed },
      { label: "Audience", href: "/dashboard/audience#youtube", icon: IconUsers },
    ],
  },
  {
    key: "facebook", label: "Facebook", icon: IconBrandFacebook, href: "/dashboard/facebook",
    children: [
      { label: "Posts", href: "/dashboard/facebook/posts", icon: IconPhoto },
      { label: "Audience", href: "/dashboard/audience#facebook", icon: IconUsers },
    ],
  },
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
    <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-widest text-[#7C8494]">
      {children}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  // Track the URL hash so per-platform Audience links highlight correctly.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace("#", ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

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

  const isActive = (href: string): boolean => {
    const [path, frag] = href.split("#");
    if (pathname !== path) return false;
    if (frag) return hash === frag;
    // Plain /dashboard/audience (the collective tab) — active unless a
    // platform-specific hash is showing.
    if (path === "/dashboard/audience") return !hash;
    return true;
  };

  // Which folders are open: auto-open the one whose parent or child is active,
  // plus any the user toggled by hand.
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const folderActive = (f: Folder) =>
    (f.href ? isActive(f.href) : false) || f.children.some((c) => isActive(c.href));

  const item = (t: NavLink, indent = false) => {
    const active = isActive(t.href);
    const Ico = t.icon;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${indent ? "ml-5" : ""} ${active ? "bg-white/10 text-white font-medium" : "text-[#AEB6C6] hover:bg-white/5 hover:text-[#F2F4F8]"}`}
      >
        <Ico size={indent ? 15 : 17} stroke={1.7} className={active ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
        {t.label}
      </Link>
    );
  };

  const folder = (f: Folder) => {
    const open = openKeys[f.key] ?? folderActive(f);
    const parentActive = f.href ? isActive(f.href) : false;
    const Ico = f.icon;
    const chevron = (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenKeys((s) => ({ ...s, [f.key]: !open })); }}
        className={`px-1.5 text-xs text-[#8A93A6] transition-transform ${open ? "rotate-90" : ""}`}
        aria-label={`${open ? "Collapse" : "Expand"} ${f.label}`}
      >
        ›
      </button>
    );
    return (
      <div key={f.key}>
        {f.href ? (
          <div className={`flex items-center rounded-lg ${parentActive ? "bg-white/10" : "hover:bg-white/5"}`}>
            <Link href={f.href} className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 ${parentActive ? "text-white font-medium" : "text-[#AEB6C6]"}`}>
              <Ico size={17} stroke={1.7} className={parentActive ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
              {f.label}
            </Link>
            {chevron}
          </div>
        ) : (
          <button
            onClick={() => setOpenKeys((s) => ({ ...s, [f.key]: !open }))}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left ${folderActive(f) ? "text-white font-medium" : "text-[#AEB6C6] hover:bg-white/5"}`}
          >
            <Ico size={17} stroke={1.7} className={folderActive(f) ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
            <span className="flex-1">{f.label}</span>
            <span className={`text-[#8A93A6] text-xs transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          </button>
        )}
        {open && f.children.map((c) => item(c, true))}
      </div>
    );
  };

  return (
    <aside className="w-64 bg-[#14151C] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-lg font-semibold text-white">GooCampus</div>
        <div className="text-xs text-[#9BA3B4]">Marketing OS</div>
      </div>

      <nav className="px-3 pt-3 pb-2 space-y-0.5 text-sm flex-1 overflow-y-auto min-h-0">
        {isAdmin && (
          <>
            {item({ label: "Overview", href: "/dashboard", icon: IconHome })}

            <GroupHeading>Content</GroupHeading>
            {CONTENT.map((t) => item(t))}

            <GroupHeading>Analytics</GroupHeading>
            {PLATFORM_FOLDERS.map(folder)}

            <GroupHeading>Audience</GroupHeading>
            {item({ label: "All platforms", href: "/dashboard/audience", icon: IconUsers })}

            <GroupHeading>Ads</GroupHeading>
            {ADS.map((t) => item(t))}

            <GroupHeading>Sales</GroupHeading>
            {SALES.map((t) => item(t))}

            <GroupHeading>AI</GroupHeading>
            {AI.map((t) => item(t))}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 space-y-0.5 text-sm">
        {isAdmin && item({ label: "Team", href: "/dashboard/team", icon: IconUsersGroup })}
        <form action="/api/logout" method="post" className="px-3 pt-1">
          <button className="flex items-center gap-2 text-xs text-[#8A93A6] hover:text-white">
            <IconLogout size={14} stroke={1.7} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
