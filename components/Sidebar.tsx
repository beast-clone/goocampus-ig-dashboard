"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCOUNTS } from "@/lib/accounts";
import { useProfile, setProfile } from "@/lib/profile";
import { hasPlatform, type PlatformKey } from "@/lib/brand-platforms";
import {
  IconHome, IconLayoutKanban, IconSun, IconCalendar, IconSend, IconRadar,
  IconCompass, IconHash, IconBrandInstagram, IconPhoto, IconMovie,
  IconCircleDashed, IconUsers, IconBrandLinkedin, IconBrandYoutube,
  IconBrandFacebook, IconSpeakerphone, IconSpy, IconScale, IconTarget,
  IconBriefcase, IconSparkles, IconReport, IconUsersGroup, IconLogout,
  IconSwitchHorizontal, IconCheck, IconTable, IconChevronRight, IconTool, IconPlugConnected, IconWand,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

// Grouped navigation + BRAND PROFILE SWITCHER (Maheen, 2026-07-12):
//   MAIN mode (profile = null): Overview · CONTENT · ANALYTICS (platform
//   folders w/ their own Audience) · AUDIENCE (all platforms) · ADS · SALES ·
//   AI · Team — the full admin home. Untouched behaviour.
//   PROFILE mode (a brand picked in the switcher): the dashboard is locked to
//   that brand and the nav slims to Overview · ANALYTICS · AUDIENCE · ADS.
//   Leads/Sales stay main-only. Clicking the GooCampus logo returns to main.
// The switcher card lives in the empty space under the last nav group.

type NavLink = { label: string; href: string; icon: TablerIcon };
type Folder = { key: string; label: string; icon: TablerIcon; href?: string; children: NavLink[] };

// Marketing Hub is a FOLDER (like the Analytics platform folders) — its five
// sub-tabs are hash-routed on the single /dashboard/marketing-hub page.
const MARKETING_HUB: Folder = {
  key: "marketing-hub", label: "Marketing Hub", icon: IconLayoutKanban, href: "/dashboard/marketing-hub?tab=team",
  children: [
    { label: "Workload", href: "/dashboard/marketing-hub?tab=team", icon: IconUsers },
    { label: "Master sheet", href: "/dashboard/marketing-hub?tab=master", icon: IconTable },
    { label: "Pipeline", href: "/dashboard/marketing-hub?tab=pipeline", icon: IconLayoutKanban },
    { label: "Content calendar", href: "/dashboard/marketing-hub?tab=calendar", icon: IconCalendar },
  ],
};

const CONTENT: NavLink[] = [
  { label: "Daily Planner", href: "/dashboard/my-day", icon: IconSun },
  { label: "Publishing Calendar", href: "/dashboard/calendar", icon: IconCalendar },
  { label: "Scheduler", href: "/dashboard/scheduler", icon: IconSend },
  { label: "Post Planner", href: "/dashboard/post-planner", icon: IconWand },
  { label: "Content Radar", href: "/dashboard/radar", icon: IconRadar },
  // Discover + Hashtags hidden (2026-07-13) — empty for these accounts. Pages kept
  // in the codebase; just removed from nav so users don't hit dead ends.
];

const PLATFORM_FOLDERS: Folder[] = [
  {
    key: "instagram", label: "Instagram", icon: IconBrandInstagram,
    children: [
      { label: "Posts", href: "/dashboard/posts", icon: IconPhoto },
      { label: "Reels", href: "/dashboard/reels", icon: IconMovie },
      { label: "Stories", href: "/dashboard/stories", icon: IconCircleDashed },
    ],
  },
  {
    key: "linkedin", label: "LinkedIn", icon: IconBrandLinkedin, href: "/dashboard/linkedin",
    children: [
      { label: "Posts", href: "/dashboard/linkedin/posts", icon: IconPhoto },
    ],
  },
  {
    key: "youtube", label: "YouTube", icon: IconBrandYoutube, href: "/dashboard/youtube",
    children: [
      { label: "Long-form", href: "/dashboard/youtube/videos#longform", icon: IconMovie },
      { label: "Shorts", href: "/dashboard/youtube/videos#shorts", icon: IconCircleDashed },
    ],
  },
  {
    key: "facebook", label: "Facebook", icon: IconBrandFacebook, href: "/dashboard/facebook",
    children: [
      { label: "Posts", href: "/dashboard/facebook/posts", icon: IconPhoto },
    ],
  },
];

const ADS: NavLink[] = [
  { label: "Ads", href: "/dashboard/ads", icon: IconSpeakerphone },
  { label: "Competitor Ads", href: "/dashboard/competitors", icon: IconSpy },
  { label: "Benchmark", href: "/dashboard/benchmark", icon: IconScale },
];

const SALES: NavLink[] = [
  // "Social Leads" (per-account, from posts/comments/ads) vs "Sales Hub" (the whole
  // CRM) — renamed so the two very different lead numbers stop reading as the same thing.
  { label: "Social Leads", href: "/dashboard/leads", icon: IconTarget },
  { label: "Sales Hub", href: "/dashboard/sales-ops", icon: IconBriefcase },
];

const AI: NavLink[] = [
  { label: "AI Insights", href: "/dashboard/ai-insights", icon: IconSparkles },
  { label: "AI Reports", href: "/dashboard/ai-reports", icon: IconReport },
];

const SYSTEM: NavLink[] = [
  { label: "Integrations", href: "/dashboard/integrations", icon: IconPlugConnected },
  { label: "Tools", href: "/dashboard/tools", icon: IconTool },
];

// Brand chip colours for the switcher avatars.
const BRAND_COLORS: Record<string, string> = {
  goocampus: "#6D5CE7",
  goocampusworld: "#1D9E75",
  "12thplusdotcom": "#EF9F27",
  samvaya_matrimony: "#D4537E",
};
function brandInitials(label: string): string {
  return label.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">
      {children}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useProfile();
  const profileAccount = profile ? ACCOUNTS.find((a) => a.id === profile) ?? null : null;

  // Track the URL hash so hash-routed links (audience/videos) highlight correctly.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace("#", ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  // Role-aware: admins see the nav; members never reach /dashboard/* at all.
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
    const [pathAndQuery, frag] = href.split("#");
    const [path, query] = pathAndQuery.split("?");
    if (pathname !== path) return false;
    // Query-param tabs (Marketing Hub) — match ?tab=, treating master as default.
    if (query) {
      const tab = new URLSearchParams(query).get("tab");
      if (tab) {
        const cur = searchParams.get("tab");
        return cur === tab || (tab === "team" && !cur);
      }
    }
    if (frag === "all") return hash === "all" || hash === "";
    if (frag) return hash === frag;
    return true;
  };

  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const folderActive = (f: Folder) =>
    (f.href ? isActive(f.href) : false) || f.children.some((c) => isActive(c.href));

  const item = (t: NavLink, indent = false) => {
    const active = isActive(t.href);
    const Ico = t.icon;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition ${active ? "bg-brand text-white font-medium shadow-sm shadow-brand/30" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}
      >
        <Ico size={indent ? 15 : 17} stroke={1.7} className={active ? "text-white" : "text-gray-400"} />
        {t.label}
      </Link>
    );
  };

  // One consistent row layout for every folder (fixes the misaligned chevrons):
  // icon + label share the items' grid; the chevron gets a fixed w-7 slot on the
  // right. Clicking a parent that has a page navigates AND unfolds its children.
  const folder = (f: Folder) => {
    // Profile mode: platforms this brand doesn't have are visible but grayed
    // out and unclickable — no other brand's data can be reached from here.
    if (profile && !hasPlatform(profile, f.key as PlatformKey)) {
      const Ico = f.icon;
      return (
        <div
          key={f.key}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg opacity-40 cursor-not-allowed select-none text-gray-400"
          title={`${profileAccount?.label ?? "This brand"} has no ${f.label} connected`}
          aria-disabled="true"
        >
          <Ico size={17} stroke={1.7} className="text-gray-300" />
          <span className="flex-1">{f.label}</span>
          <span className="text-[9px] uppercase tracking-wider pr-1.5">none</span>
        </div>
      );
    }
    const open = openKeys[f.key] ?? folderActive(f);
    const parentActive = f.href ? isActive(f.href) : false;
    const Ico = f.icon;
    const toggle = () => setOpenKeys((s) => ({ ...s, [f.key]: !open }));
    const forceOpen = () => setOpenKeys((s) => ({ ...s, [f.key]: true }));
    const chevron = (onClick: (e: React.MouseEvent) => void) => (
      <button
        onClick={onClick}
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900"
        aria-label={`${open ? "Collapse" : "Expand"} ${f.label}`}
      >
        <IconChevronRight size={15} stroke={2} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
    );
    return (
      <div key={f.key}>
        {f.href ? (
          <div className={`flex items-center rounded-lg pr-0.5 transition ${parentActive ? "bg-brand shadow-sm shadow-brand/30" : "hover:bg-gray-50"}`}>
            <Link
              href={f.href}
              onClick={forceOpen}
              className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 ${parentActive ? "text-white font-medium" : "text-gray-500"}`}
            >
              <Ico size={17} stroke={1.7} className={parentActive ? "text-white" : "text-gray-400"} />
              {f.label}
            </Link>
            {chevron((e) => { e.preventDefault(); e.stopPropagation(); toggle(); })}
          </div>
        ) : (
          <button
            onClick={toggle}
            className={`w-full flex items-center rounded-lg pr-0.5 text-left transition ${folderActive(f) ? "text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <span className="flex-1 flex items-center gap-2.5 px-3 py-1.5">
              <Ico size={17} stroke={1.7} className={folderActive(f) ? "text-brand" : "text-gray-400"} />
              {f.label}
            </span>
            <span className="w-7 h-7 flex items-center justify-center text-gray-400">
              <IconChevronRight size={15} stroke={2} className={`transition-transform ${open ? "rotate-90" : ""}`} />
            </span>
          </button>
        )}
        {open && (
          <div className="ml-5 mt-0.5 mb-1 pl-2 border-l border-gray-100 space-y-0.5">
            {f.children.map((c) => item(c, true))}
          </div>
        )}
      </div>
    );
  };

  const switchTo = (id: string | null) => {
    setProfile(id);
    setSwitcherOpen(false);
    router.push("/dashboard");
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">
      {/* Logo = home. In profile mode, clicking it returns to the main dashboard. */}
      <button
        onClick={() => switchTo(null)}
        className="px-5 py-5 border-b border-gray-100 text-left hover:bg-gray-50 flex items-center gap-2.5"
        title={profile ? "Back to the main dashboard" : "Main dashboard"}
      >
        <span className="w-9 h-9 rounded-[10px] bg-brand flex items-center justify-center text-white font-bold text-sm flex-shrink-0">G</span>
        <span>
          <span className="block text-lg font-bold text-gray-900 leading-tight">GooCampus</span>
          <span className="block text-[11px] text-gray-400">Marketing OS</span>
        </span>
      </button>

      <nav className="px-3 pt-3 pb-2 space-y-0.5 text-sm flex-1 overflow-y-auto min-h-0 sidebar-scroll">
        {isAdmin && (
          <>
            {item({ label: "Overview", href: "/dashboard", icon: IconHome })}

            {!profile && (
              <>
                <GroupHeading>Content</GroupHeading>
                {folder(MARKETING_HUB)}
                {CONTENT.map((t) => item(t))}
              </>
            )}

            <GroupHeading>Analytics</GroupHeading>
            {PLATFORM_FOLDERS.map(folder)}

            <GroupHeading>Audience</GroupHeading>
            {item({ label: "All platforms", href: "/dashboard/audience#all", icon: IconUsers })}

            <GroupHeading>Ads</GroupHeading>
            {ADS.map((t) => item(t))}

            {!profile && (
              <>
                <GroupHeading>Sales</GroupHeading>
                {SALES.map((t) => item(t))}

                <GroupHeading>AI</GroupHeading>
                {AI.map((t) => item(t))}

                <GroupHeading>System</GroupHeading>
                {SYSTEM.map((t) => item(t))}
              </>
            )}

            {/* ── Brand profile switcher — lives in the empty space below the groups ── */}
            <div className="pt-5 pb-2 relative">
              {switcherOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl z-20">
                  <button
                    onClick={() => switchTo(null)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-sm"
                  >
                    <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500"><IconHome size={15} stroke={1.7} /></span>
                    <span className="flex-1">Main dashboard</span>
                    {!profile && <IconCheck size={15} className="text-brand" />}
                  </button>
                  <div className="border-t border-gray-100" />
                  {ACCOUNTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => switchTo(a.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-sm"
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: BRAND_COLORS[a.id] ?? "#555" }}
                      >
                        {brandInitials(a.label)}
                      </span>
                      <span className="flex-1 truncate">{a.label}</span>
                      {profile === a.id && <IconCheck size={15} className="text-brand" />}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-left"
              >
                {profileAccount ? (
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: BRAND_COLORS[profileAccount.id] ?? "#555" }}
                  >
                    {brandInitials(profileAccount.label)}
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500"><IconHome size={15} stroke={1.7} /></span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-widest text-gray-400">{profileAccount ? "Profile" : "Viewing"}</span>
                  <span className="block text-sm text-gray-900 truncate">{profileAccount ? profileAccount.label : "Main dashboard"}</span>
                </span>
                <IconSwitchHorizontal size={15} stroke={1.7} className="text-gray-400 flex-shrink-0" />
              </button>
            </div>
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100 space-y-0.5 text-sm">
        {isAdmin && !profile && item({ label: "Team", href: "/dashboard/team", icon: IconUsersGroup })}
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
