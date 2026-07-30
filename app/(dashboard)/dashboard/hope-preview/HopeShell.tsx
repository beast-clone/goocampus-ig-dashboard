import { HopeSidebar } from "./HopeSidebar";

// Shared Hope UI (Version 2) shell — theme root + the shared grouped sidebar
// (HopeSidebar) + an optional topbar. Used by every cloned tab (via
// HopeDashboardShell) so all V2 pages share one identical Hope chrome.
export type HopeTab =
  | "my-day" | "overview" | "marketing-hub" | "calendar" | "content-review" | "scheduler" | "post-planner" | "radar"
  | "instagram" | "linkedin" | "youtube" | "facebook" | "website" | "seo" | "audience"
  | "ads" | "competitors" | "benchmark" | "leads" | "sales" | "ai-insights" | "ai-reports"
  | "integrations" | "diagnostics" | "tools" | "team" | "account";

export function HopeShell({
  active, title, subtitle, children, headerRight, hideTopbar,
}: {
  active: HopeTab;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  hideTopbar?: boolean;
}) {
  return (
    <div className="hope-root">
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      <div className="hshell">
        <HopeSidebar active={active} />
        <main className="hmain">
          {!hideTopbar && (
            <div className="htopbar">
              <div className="htitle-wrap">
                <p className="hbanner">
                  <b>{title}</b>
                </p>
                {subtitle && <p className="hsub">{subtitle}</p>}
              </div>
              {headerRight && <div className="htopbar-right">{headerRight}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

const SHELL_CSS = `
.hope-root{
  --bg:#F5F6FA;--panel:#FFFFFF;--panel-2:#F7F8FC;
  --ink:#232D42;--ink-soft:#4A5468;--muted:#8A92A6;--faint:#A6ACBE;
  --line:#EEF0F4;--line-2:#F3F5F9;
  --brand:#3A57E8;--brand-soft:#E9ECFB;--brand-ink:#2138B0;
  --good:#1AA053;--good-soft:#E3F5EA;--warn:#D97706;--warn-soft:#FEF3E2;--rose:#E11D48;--rose-soft:#FCE8EC;
  --sky:#0EA5E9;--sky-soft:#E4F4FD;--violet:#6E48F8;--violet-soft:#EFEBFE;
  --shadow:0 10px 30px rgba(35,45,66,0.06);
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
  color:var(--ink);background:var(--bg);min-height:100vh;font-size:14.5px;
}
.hope-root *{box-sizing:border-box}
.hshell{display:flex;align-items:stretch;min-height:100vh}
.hmain{flex:1;min-width:0;padding:clamp(1rem,2.2vw,2.2rem)}
.htopbar{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.1rem}
.hbanner{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0;color:var(--muted);font-size:.82rem}
.hbanner b{color:var(--ink);font-size:.95rem;font-weight:500}
.htag{font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand-ink);background:var(--brand-soft);border-radius:5px;padding:.15em .5em;font-weight:600}
.hsub{margin:.3rem 0 0;color:var(--muted);font-size:.8rem}
.htopbar-right{display:flex;align-items:center;gap:.6rem}
`;
