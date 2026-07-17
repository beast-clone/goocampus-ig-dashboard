"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconSunHigh, IconLayoutGrid, IconChartBar, IconCalendarEvent, IconWand, IconRadar2,
  IconClockHour4, IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconBrandFacebook,
  IconUsers, IconSpeakerphone, IconTargetArrow, IconChartHistogram, IconUserDollar,
  IconReportMoney, IconBulb, IconReportAnalytics, IconSettings, IconTools, IconUsersGroup,
  IconChevronRight, IconPhoto, IconMovie, IconCircleDashed, IconTable, IconLayoutKanban,
  IconChecklist, IconWorldWww, IconClick, IconChartArcs, IconSearch,
} from "@tabler/icons-react";
import type { HopeTab } from "./HopeShell";

// The ONE shared Hope UI sidebar — used by HopeShell (cloned tabs) AND the
// hand-built HopeOverview so every V2 page has the identical grouped, expandable
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
    { key: "marketing-hub", label: "Marketing Hub", icon: IconChartBar, href: `${HUB}/marketing-hub?tab=team`, children: [
      { label: "Workload",         href: `${HUB}/marketing-hub?tab=team`,     icon: IconUsers },
      { label: "Master sheet",     href: `${HUB}/marketing-hub?tab=master`,   icon: IconTable },
      { label: "Pipeline",         href: `${HUB}/marketing-hub?tab=pipeline`, icon: IconLayoutKanban },
      { label: "Content calendar", href: `${HUB}/marketing-hub?tab=calendar`, icon: IconCalendarEvent },
    ] },
    { label: "My Day",              href: `${HUB}/my-day`,       icon: IconSunHigh },
    { label: "Content Radar",       href: `${HUB}/radar`,        icon: IconRadar2 },
  ] },
  { label: "Social Media", items: [
    { label: "Publishing Calendar", href: `${HUB}/calendar`,        icon: IconCalendarEvent },
    { label: "Content Review",      href: `${HUB}/content-review`,  icon: IconChecklist },
    { label: "Scheduler",           href: `${HUB}/scheduler`,       icon: IconClockHour4 },
    { label: "Post Planner",        href: `${HUB}/post-planner`,    icon: IconWand },
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
      { label: "Clarity",          href: `${HUB}/website/behavior`, icon: IconClick },
      { label: "Bing",             href: `${HUB}/website/search`,   icon: IconSearch },
    ] },
  ] },
  { label: "Audience", items: [{ label: "All platforms", href: `${HUB}/audience`, icon: IconUsers }] },
  { label: "Ads", items: [
    { label: "Ads",            href: `${HUB}/ads`,         icon: IconSpeakerphone },
    { label: "Competitor Ads", href: `${HUB}/competitors`, icon: IconTargetArrow },
    { label: "Benchmark",      href: `${HUB}/benchmark`,   icon: IconChartHistogram },
  ] },
  { label: "Sales", items: [
    { label: "Social Leads", href: `${HUB}/leads`,     icon: IconUserDollar },
    { label: "Sales Hub",    href: `${HUB}/sales-ops`, icon: IconReportMoney },
  ] },
  { label: "AI", items: [
    { label: "AI Insights", href: `${HUB}/ai-insights`, icon: IconBulb },
    { label: "AI Reports",  href: `${HUB}/ai-reports`,  icon: IconReportAnalytics },
  ] },
  { label: "System", items: [
    { label: "Integrations", href: `${HUB}/integrations`, icon: IconSettings },
    { label: "Tools",        href: `${HUB}/tools`,        icon: IconTools },
    { label: "Team",         href: `${HUB}/team`,         icon: IconUsersGroup },
  ] },
];

export function HopeSidebar({ active }: { active: HopeTab }) {
  const pathname = usePathname();
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
      <a href={leaf.href} className={`hnavitem ${indent ? "child" : ""} ${isActive(leaf.href) ? "active" : ""}`}>
        <Icon size={indent ? 15 : 16} stroke={1.8} /> <span>{leaf.label}</span>
      </a>
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
            <a href={f.href} onClick={() => setOpenKeys((s) => ({ ...s, [f.key]: true }))} className={`hnavitem folderlink ${(pActive || semi) ? "semi" : ""}`}>
              <Icon size={16} stroke={1.8} /> <span>{f.label}</span>
            </a>
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
    <aside className="hsidebar">
      <style dangerouslySetInnerHTML={{ __html: SIDEBAR_CSS }} />
      <div className="hbrand">
        <span className="hlogo"><IconBrandInstagram size={16} style={{ transform: "rotate(-45deg)" }} /></span>
        <span className="hbrandname">GooCampus</span>
      </div>
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
.hsidebar .hbrand{display:flex;align-items:center;gap:10px;padding:20px 8px 14px;position:sticky;top:0;background:var(--sb-panel);z-index:2}
.hsidebar .hlogo{width:32px;height:32px;border-radius:9px;background:var(--sb-brand);display:grid;place-items:center;color:#fff;transform:rotate(45deg);flex:0 0 32px}
.hsidebar .hlogo svg{color:#fff}
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
