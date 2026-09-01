import { PreviewSidebar } from "./PreviewSidebar";
import { SHELL_CSS } from "./PreviewShell";

// Every Version-2 page shares this chrome — the theme root, the flex shell and the
// sidebar. It lives in the layout so React keeps it mounted across navigation:
// each page used to render its own copy, so moving between pages tore the sidebar
// down and rebuilt it, losing its scroll position and costing a re-render.
//
// The layout deliberately does NOT render <main>. The three page families style
// their own main column differently (the standard padded one, the Overview's
// full-bleed sticky header, My Day's chat-pane padding), so each supplies its own.
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="preview-root">
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      <div className="hshell">
        <PreviewSidebar />
        {children}
      </div>
    </div>
  );
}
