"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  IconSunHigh, IconLayoutGrid, IconChartBar, IconCalendarEvent, IconRadar2, IconSparkles,
  IconClockHour4, IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconBrandFacebook,
  IconUsers, IconUserCheck, IconSpeakerphone, IconTargetArrow, IconChartHistogram, IconUserDollar, IconBook2,
  IconReportMoney, IconBulb, IconReportAnalytics, IconSettings, IconTools, IconUsersGroup, IconActivityHeartbeat,
  IconCalendarStats, IconChartPie, IconTimeline, IconArrowsExchange, IconIdBadge2,
  IconChevronRight, IconPhoto, IconMovie, IconCircleDashed, IconTable, IconLayoutKanban,
  IconChecklist, IconWorldWww, IconClick, IconChartArcs, IconSearch, IconBrandGoogle, IconTrendingUp,
  IconDeviceMobile, IconArchive, IconTrash, IconMessageChatbot, IconInbox,
} from "@tabler/icons-react";
import type { HopeTab } from "./HopeShell";
import { GlobalSearch } from "./GlobalSearch";

// The ONE shared Hope UI sidebar — used by HopeShell (cloned tabs) AND the
// hand-built HopeOverview so every V2 page has the identical grouped, expandable
// Links are next/link, not <a>: a plain anchor makes every sidebar click a full
// browser page load — the app unmounts, every bundle re-downloads and the whole
// screen rebuilds. Link keeps the app mounted and swaps only the page.
//
// nav (no V1 sidebar anywhere). Self-contained: it injects its own scoped CSS and
// theme vars, so it renders correctly whether or not a `.hope-root` wraps it.
// Grouping matches V1 components/Sidebar.tsx exactly, hrefs point to hope-preview.
type Leaf = { label: string; href: string; icon: any };
type Folder = { key: string; label: string; icon: any; href?: string; children: Leaf[] };
type Group = { label?: string; items: (Leaf | Folder)[] };
const isFolder = (x: Leaf | Folder): x is Folder => "children" in x;

const HUB = "/dashboard/hope-preview";
const OVERVIEW: Leaf = { label: "Overview", href: HUB, icon: IconLayoutGrid };

const GROUPS: Group[] = [
  { label: "Content", items: [
    { key: "my-workspace", label: "My Workspace", icon: IconSunHigh, href: `${HUB}/briefing`, children: [
      { label: "Briefing",         href: `${HUB}/briefing`,                   icon: IconChartBar },
      { label: "My Day",           href: `${HUB}/my-day`,                     icon: IconSunHigh },
      { label: "Workload",         href: `${HUB}/marketing-hub?tab=team`,     icon: IconUsers },
      { label: "Attendance",       href: `${HUB}/attendance`,                 icon: IconUserCheck },
      { label: "Master sheet",     href: `${HUB}/marketing-hub?tab=master`,   icon: IconTable },
      { label: "Pipeline",         href: `${HUB}/marketing-hub?tab=pipeline`, icon: IconLayoutKanban },
      { label: "Content calendar", href: `${HUB}/marketing-hub?tab=calendar`, icon: IconCalendarEvent },
    ] },
    { label: "Content Radar",       href: `${HUB}/radar`,        icon: IconRadar2 },
    { label: "Content Studio",      href: `${HUB}/content-studio`, icon: IconSparkles },
  ] },
  { label: "Social Media", items: [
    { label: "Publishing Calendar", href: `${HUB}/calendar`,        icon: IconCalendarEvent },
    { label: "Content Review",      href: `${HUB}/content-review`,  icon: IconChecklist },
    { label: "Scheduler",           href: `${HUB}/scheduler`,       icon: IconClockHour4 },
  ] },
  { label: "Analytics", items: [
    { key: "instagram", label: "Instagram", icon: IconBrandInstagram, children: [
      { label: "Posts",   href: `${HUB}/posts`,   icon: IconPhoto },
      { label: "Reels",   href: `${HUB}/reels`,   icon: IconMovie },
      { label: "Stories", href: `${HUB}/stories`, icon: IconCircleDashed },
    ] },
    { key: "linkedin", label: "LinkedIn", icon: IconBrandLinkedin, href: `${HUB}/linkedin`, children: [
      { label: "Posts", href: `${HUB}/linkedin/posts`, icon: IconPhoto },
    ] },
    { key: "youtube", label: "YouTube", icon: IconBrandYoutube, href: `${HUB}/youtube`, children: [
      { label: "Long-form", href: `${HUB}/youtube/videos#longform`, icon: IconMovie },
      { label: "Shorts",    href: `${HUB}/youtube/videos#shorts`,   icon: IconCircleDashed },
    ] },
    { key: "facebook", label: "Facebook", icon: IconBrandFacebook, href: `${HUB}/facebook`, children: [
      { label: "Posts", href: `${HUB}/facebook/posts`, icon: IconPhoto },
    ] },
    { key: "website", label: "Website", icon: IconWorldWww, href: `${HUB}/website`, children: [
      { label: "Google Analytics", href: `${HUB}/website`,          icon: IconChartArcs },
      { label: "Search Console",   href: `${HUB}/website/google`,   icon: IconBrandGoogle },
      { label: "Clarity",          href: `${HUB}/website/behavior`, icon: IconClick },
      { label: "Bing",             href: `${HUB}/website/search`,   icon: IconSearch },
    ] },
    { label: "SEO", href: `${HUB}/seo`, icon: IconTrendingUp },
  ] },
  { label: "Audience", items: [{ label: "All platforms", href: `${HUB}/audience`, icon: IconUsers }] },
  { label: "Ads", items: [
    { label: "Ads",            href: `${HUB}/ads`,         icon: IconSpeakerphone },
    { label: "Competitor Ads", href: `${HUB}/competitors`, icon: IconTargetArrow },
    { label: "Competitors",    href: `${HUB}/benchmark`,   icon: IconChartHistogram },
  ] },
  { label: "Sales", items: [
    { label: "Inbox",         href: `${HUB}/inbox`,          icon: IconInbox },
    { label: "Social Leads",  href: `${HUB}/leads`,          icon: IconUserDollar },
    // Sales Hub is a folder, not a page with tabs inside it: the six views were
    // in-page tabs and read as a second, competing navigation next to the sidebar.
    { key: "sales-hub", label: "Sales Hub", icon: IconReportMoney, href: `${HUB}/sales-ops`, children: [
      { label: "Per day",       href: `${HUB}/sales-ops/per-day`,     icon: IconCalendarStats },
      { label: "By interest",   href: `${HUB}/sales-ops/interests`,   icon: IconChartPie },
      { label: "Counsellors",   href: `${HUB}/sales-ops/counsellors`, icon: IconUsers },
      { label: "Leads tracker", href: `${HUB}/sales-ops/tracker`,     icon: IconTimeline },
      { label: "Transfer",      href: `${HUB}/sales-ops/transfer`,    icon: IconArrowsExchange },
      { label: "Roles",         href: `${HUB}/sales-ops/roles`,       icon: IconIdBadge2 },
    ] },
    { label: "Organic Sales", href: `${HUB}/organic-sales`,  icon: IconBook2 },
  ] },
  { label: "AI", items: [
    { label: "Ask GooCampus",   href: `${HUB}/assistant`,   icon: IconMessageChatbot },
    { label: "AI Insights",     href: `${HUB}/ai-insights`, icon: IconBulb },
    { key: "reports", label: "Reports", icon: IconArchive, href: `${HUB}/ai-reports`, children: [
      { label: "Monthly Reports",      href: `${HUB}/ai-reports`,     icon: IconReportAnalytics },
      { label: "Social Media Reports", href: `${HUB}/reports/social`, icon: IconDeviceMobile },
      { label: "Recycle Bin",          href: `${HUB}/reports/trash`,  icon: IconTrash },
    ] },
  ] },
  { label: "System", items: [
    { label: "Integrations", href: `${HUB}/integrations`, icon: IconSettings },
    { label: "Diagnostics",  href: `${HUB}/diagnostics`,  icon: IconActivityHeartbeat },
    { label: "Tools",        href: `${HUB}/tools`,        icon: IconTools },
    { label: "Team",         href: `${HUB}/team`,         icon: IconUsersGroup },
  ] },
];

// The sidebar is its own scroll container (100vh, overflow-y:auto) and there is no
// shared layout, so every page renders — and therefore REMOUNTS — it. Its scroll
// jumped back to 0 on each navigation: you clicked a Sales Hub sub-page near the
// bottom and landed looking at Overview, with Sales scrolled out of sight.
//
// Remember where it was and put it back before the browser paints, and if there's
// nothing remembered (first load, new tab) bring the active item into view instead.
export function HopeSidebar({ active }: { active: HopeTab }) {
  const asideRef = useRef<HTMLElement>(null);


  const pathname = usePathname();

  // Every page renders its own copy of this sidebar, so navigating REMOUNTS it and
  // its scroll snaps back to 0. Sales Hub and its children sit ~1100px down a
  // 1650px nav, so clicking a sub-page left you staring at Overview with the thing
  // you just clicked 340px below the fold.
  //
  // Restoring a remembered pixel offset proved unreliable (it clamps if applied
  // before layout settles). Centring the active item is deterministic: wherever it
  // is, you can see it and its siblings after every navigation. Runs after paint,
  // when the folder is expanded and offsets are final, and moves only the sidebar —
  // never the page.
  useEffect(() => {
    const el = asideRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    const current = el.querySelector<HTMLElement>(".hnavitem.active");
    if (!current) return;
    const box = current.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    const fullyVisible = box.top >= frame.top + 56 && box.bottom <= frame.bottom - 24;
    if (fullyVisible) return;
    const delta = box.top - frame.top;
    el.scrollTop += delta - el.clientHeight / 2 + box.height / 2;
  }, [pathname]);
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace("#", ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  const isActive = (href: string): boolean => {
    const [pq, frag] = href.split("#");
    const [path, query] = pq.split("?");
    if (pathname !== path) return false;
    if (query) {
      const tab = new URLSearchParams(query).get("tab");
      if (tab) { const cur = searchParams.get("tab"); return cur === tab || (tab === "team" && !cur); }
    }
    if (frag) return hash === frag;
    return true;
  };
  const folderActive = (f: Folder) => (f.href ? isActive(f.href) : false) || f.children.some((c) => isActive(c.href)) || active === (f.key as HopeTab);

  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const LeafRow = ({ leaf, indent }: { leaf: Leaf; indent?: boolean }) => {
    const Icon = leaf.icon;
    return (
      <Link href={leaf.href} prefetch className={`hnavitem ${indent ? "child" : ""} ${isActive(leaf.href) ? "active" : ""}`}>
        <Icon size={indent ? 15 : 16} stroke={1.8} /> <span>{leaf.label}</span>
      </Link>
    );
  };
  const FolderRow = ({ f }: { f: Folder }) => {
    const open = openKeys[f.key] ?? folderActive(f);
    const Icon = f.icon;
    const pActive = f.href ? isActive(f.href) : false;
    const semi = !pActive && folderActive(f);
    const toggle = () => setOpenKeys((s) => ({ ...s, [f.key]: !open }));
    return (
      <div>
        <div className="hnavfolder">
          {f.href ? (
            <Link href={f.href} prefetch onClick={() => setOpenKeys((s) => ({ ...s, [f.key]: true }))} className={`hnavitem folderlink ${(pActive || semi) ? "semi" : ""}`}>
              <Icon size={16} stroke={1.8} /> <span>{f.label}</span>
            </Link>
          ) : (
            <button onClick={toggle} className={`hnavitem folderlink ${semi ? "semi" : ""}`}>
              <Icon size={16} stroke={1.8} /> <span>{f.label}</span>
            </button>
          )}
          <button className="hchev" aria-label={`${open ? "Collapse" : "Expand"} ${f.label}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}>
            <IconChevronRight size={14} stroke={2} className={open ? "rot" : ""} />
          </button>
        </div>
        {open && <div className="hnavchildren">{f.children.map((c) => <LeafRow key={c.href} leaf={c} indent />)}</div>}
      </div>
    );
  };

  return (
    <aside className="hsidebar" ref={asideRef}>
      <style dangerouslySetInnerHTML={{ __html: SIDEBAR_CSS }} />
      <div className="hbrand">
        {/* Logo → Overview (the main page). */}
        <Link href={OVERVIEW.href} aria-label="Go to Overview" className="hlogo-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/goocampus-logo.png" alt="GooCampus" className="hlogo-img" />
        </Link>
      </div>
      <GlobalSearch />
      <LeafRow leaf={OVERVIEW} />
      {GROUPS.map((g) => (
        <div key={g.label}>
          {g.label && <div className="hnavgroup">{g.label}</div>}
          {g.items.map((it) => (isFolder(it) ? <FolderRow key={it.key} f={it} /> : <LeafRow key={it.href} leaf={it} />))}
        </div>
      ))}
    </aside>
  );
}

// Self-contained: declares its own theme vars on .hsidebar so it renders the same
// whether or not an ancestor set them (HopeOverview uses inline styles, no .hope-root).
const SIDEBAR_CSS = `
.hsidebar{--sb-brand:#3A57E8;--sb-brand-soft:#E9ECFB;--sb-brand-ink:#2138B0;--sb-ink:#232D42;--sb-ink-soft:#4A5468;--sb-faint:#A6ACBE;--sb-line:#EEF0F4;--sb-panel:#FFFFFF;--sb-panel2:#F7F8FC;
  width:236px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--sb-panel);border-right:1px solid var(--sb-line);padding:0 11px 16px;font-family:Inter,system-ui,sans-serif}
.hsidebar *{box-sizing:border-box}
.hsidebar::-webkit-scrollbar{width:6px}.hsidebar::-webkit-scrollbar-thumb{background:#E3E6EE;border-radius:3px}
@media(max-width:980px){.hsidebar{display:none}}
.hsidebar .hbrand{display:flex;align-items:center;justify-content:center;padding:16px 8px 14px;position:sticky;top:0;background:var(--sb-panel);z-index:2}
.hsidebar .hlogo-link{display:inline-block;cursor:pointer;line-height:0}
.hsidebar .hlogo-img{width:92px;max-width:100%;height:auto;object-fit:contain;display:block}
.hsidebar .hbrandname{font-weight:600;font-size:1.05rem;color:var(--sb-ink)}
.hsidebar .hnavgroup{font-family:ui-monospace,Menlo,monospace;font-size:.58rem;text-transform:uppercase;letter-spacing:.09em;color:var(--sb-faint);font-weight:700;padding:13px 10px 5px}
.hsidebar .hnavitem{display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:9px;font-size:.82rem;font-weight:500;color:var(--sb-ink-soft);cursor:pointer;margin-bottom:1px;text-decoration:none;width:100%;border:none;background:none;text-align:left;font-family:inherit}
.hsidebar .hnavitem:hover{background:var(--sb-panel2)}
.hsidebar .hnavitem.active{background:var(--sb-brand);color:#fff;box-shadow:0 6px 14px rgba(58,87,232,.24)}
.hsidebar .hnavitem.active svg{color:#fff}
.hsidebar .hnavitem.semi{color:var(--sb-brand-ink)}
.hsidebar .hnavitem.semi svg{color:var(--sb-brand)}
.hsidebar .hnavitem.child{font-size:.79rem;padding:6px 10px}
.hsidebar .hnavitem.child.active{background:var(--sb-brand-soft);color:var(--sb-brand-ink);box-shadow:none;font-weight:600}
.hsidebar .hnavitem.child.active svg{color:var(--sb-brand)}
.hsidebar .hnavfolder{display:flex;align-items:center;gap:2px}
.hsidebar .hnavfolder .folderlink{flex:1}
.hsidebar .hchev{width:26px;height:30px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;border:none;background:none;color:var(--sb-faint);cursor:pointer;border-radius:8px}
.hsidebar .hchev:hover{color:var(--sb-ink-soft);background:var(--sb-panel2)}
.hsidebar .hchev .rot{transform:rotate(90deg)}
.hsidebar .hchev svg{transition:transform .15s}
.hsidebar .hnavchildren{margin:2px 0 3px 20px;padding-left:8px;border-left:1px solid var(--sb-line);display:flex;flex-direction:column;gap:1px}
`;
