"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCOUNTS } from "@/lib/accounts";
import { useProfile, setProfile } from "@/lib/profile";
import {
  IconHome, IconLayoutKanban, IconSun, IconCalendar, IconSend, IconRadar,
  IconCompass, IconHash, IconBrandInstagram, IconPhoto, IconMovie,
  IconCircleDashed, IconUsers, IconBrandLinkedin, IconBrandYoutube,
  IconBrandFacebook, IconSpeakerphone, IconSpy, IconScale, IconTarget,
  IconBriefcase, IconSparkles, IconReport, IconUsersGroup, IconLogout,
  IconSwitchHorizontal, IconCheck,
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

const CONTENT: NavLink[] = [
  { label: "Marketing Hub", href: "/dashboard/marketing-hub", icon: IconLayoutKanban },
  { label: "My Day", href: "/dashboard/my-day", icon: IconSun },
  { label: "Content Calendar", href: "/dashboard/calendar", icon: IconCalendar },
  { label: "Scheduler", href: "/dashboard/scheduler", icon: IconSend },
  { label: "Content Radar", href: "/dashboard/radar", icon: IconRadar },
  { label: "Discover", href: "/dashboard/discover", icon: IconCompass },
  { label: "Hashtags", href: "/dashboard/hashtags", icon: IconHash },
];

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
    <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-widest text-[#7C8494]">
      {children}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
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
    const [path, frag] = href.split("#");
    if (pathname !== path) return false;
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
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${indent ? "ml-5" : ""} ${active ? "bg-white/10 text-white font-medium" : "text-[#AEB6C6] hover:bg-white/5 hover:text-[#F2F4F8]"}`}
      >
        <Ico size={indent ? 15 : 17} stroke={1.7} className={active ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
        {t.label}
      </Link>
    );
  };

  // One consistent row layout for every folder (fixes the misaligned chevrons):
  // icon + label share the items' grid; the chevron gets a fixed w-7 slot on the
  // right. Clicking a parent that has a page navigates AND unfolds its children.
  const folder = (f: Folder) => {
    const open = openKeys[f.key] ?? folderActive(f);
    const parentActive = f.href ? isActive(f.href) : false;
    const Ico = f.icon;
    const toggle = () => setOpenKeys((s) => ({ ...s, [f.key]: !open }));
    const forceOpen = () => setOpenKeys((s) => ({ ...s, [f.key]: true }));
    const chevron = (onClick: (e: React.MouseEvent) => void) => (
      <button
        onClick={onClick}
        className={`w-7 h-7 flex items-center justify-center text-xs text-[#8A93A6] hover:text-white transition-transform ${open ? "rotate-90" : ""}`}
        aria-label={`${open ? "Collapse" : "Expand"} ${f.label}`}
      >
        ›
      </button>
    );
    return (
      <div key={f.key}>
        {f.href ? (
          <div className={`flex items-center rounded-lg pr-0.5 ${parentActive ? "bg-white/10" : "hover:bg-white/5"}`}>
            <Link
              href={f.href}
              onClick={forceOpen}
              className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 ${parentActive ? "text-white font-medium" : "text-[#AEB6C6]"}`}
            >
              <Ico size={17} stroke={1.7} className={parentActive ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
              {f.label}
            </Link>
            {chevron((e) => { e.preventDefault(); e.stopPropagation(); toggle(); })}
          </div>
        ) : (
          <button
            onClick={toggle}
            className={`w-full flex items-center rounded-lg pr-0.5 text-left ${folderActive(f) ? "text-white font-medium" : "text-[#AEB6C6] hover:bg-white/5"}`}
          >
            <span className="flex-1 flex items-center gap-2.5 px-3 py-1.5">
              <Ico size={17} stroke={1.7} className={folderActive(f) ? "text-[#A99AF5]" : "text-[#8A93A6]"} />
              {f.label}
            </span>
            <span className={`w-7 h-7 flex items-center justify-center text-xs text-[#8A93A6] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          </button>
        )}
        {open && f.children.map((c) => item(c, true))}
      </div>
    );
  };

  const switchTo = (id: string | null) => {
    setProfile(id);
    setSwitcherOpen(false);
    router.push("/dashboard");
  };

  return (
    <aside className="w-64 bg-[#14151C] flex flex-col h-screen sticky top-0">
      {/* Logo = home. In profile mode, clicking it returns to the main dashboard. */}
      <button
        onClick={() => switchTo(null)}
        className="px-5 py-5 border-b border-white/10 text-left hover:bg-white/5"
        title={profile ? "Back to the main dashboard" : "Main dashboard"}
      >
        <div className="text-lg font-semibold text-white">GooCampus</div>
        <div className="text-xs text-[#9BA3B4]">Marketing OS</div>
      </button>

      <nav className="px-3 pt-3 pb-2 space-y-0.5 text-sm flex-1 overflow-y-auto min-h-0">
        {isAdmin && (
          <>
            {item({ label: "Overview", href: "/dashboard", icon: IconHome })}

            {!profile && (
              <>
                <GroupHeading>Content</GroupHeading>
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
              </>
            )}

            {/* ── Brand profile switcher — lives in the empty space below the groups ── */}
            <div className="pt-5 pb-2 relative">
              {switcherOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1D1E27] border border-white/10 rounded-xl overflow-hidden shadow-xl z-20">
                  <button
                    onClick={() => switchTo(null)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[#AEB6C6] hover:bg-white/5 hover:text-white text-sm"
                  >
                    <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><IconHome size={15} stroke={1.7} /></span>
                    <span className="flex-1">Main dashboard</span>
                    {!profile && <IconCheck size={15} className="text-[#A99AF5]" />}
                  </button>
                  <div className="border-t border-white/10" />
                  {ACCOUNTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => switchTo(a.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[#AEB6C6] hover:bg-white/5 hover:text-white text-sm"
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: BRAND_COLORS[a.id] ?? "#555" }}
                      >
                        {brandInitials(a.label)}
                      </span>
                      <span className="flex-1 truncate">{a.label}</span>
                      {profile === a.id && <IconCheck size={15} className="text-[#A99AF5]" />}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left"
              >
                {profileAccount ? (
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: BRAND_COLORS[profileAccount.id] ?? "#555" }}
                  >
                    {brandInitials(profileAccount.label)}
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-[#AEB6C6]"><IconHome size={15} stroke={1.7} /></span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-widest text-[#7C8494]">{profileAccount ? "Profile" : "Viewing"}</span>
                  <span className="block text-sm text-white truncate">{profileAccount ? profileAccount.label : "Main dashboard"}</span>
                </span>
                <IconSwitchHorizontal size={15} stroke={1.7} className="text-[#8A93A6] flex-shrink-0" />
              </button>
            </div>
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 space-y-0.5 text-sm">
        {isAdmin && !profile && item({ label: "Team", href: "/dashboard/team", icon: IconUsersGroup })}
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
