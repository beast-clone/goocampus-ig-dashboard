"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconLock } from "@tabler/icons-react";
import { canSeeTab, tabForUrl, type Permissions, type Sections } from "@/lib/permissions";

// A tab switched off on Team & access is hidden from the sidebar; this stops a
// bookmark or a shared link from opening it anyway (Praveen, 22 Oct). The API
// routes stay guarded per section as before — this is the page-level half.
export function TabGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const search = useSearchParams()?.toString() || "";
  const [me, setMe] = useState<{ isAdmin?: boolean; sections?: Sections; permissions?: Permissions } | null>(null);
  const router = useRouter();
  // Back to where you were (22 Oct): remember the page you're on; the first time the
  // dashboard opens in a browser session on the plain home page — which is where
  // signing in lands — go straight back to it, the way Chrome restores tabs.
  // The restore waits for /api/me, so it never sends someone back to a tab that has
  // since been switched off for them. No last page, My Day off and Team Command on
  // (Maheen, 22 Oct) → start on Team Command instead of the Overview.
  const firstOpen = useRef<boolean | null>(null);
  useEffect(() => {
    const here = pathname + (search ? `?${search}` : "");
    try {
      if (firstOpen.current === null) {
        firstOpen.current = !sessionStorage.getItem("gc-session-started") && pathname === "/dashboard/preview";
        sessionStorage.setItem("gc-session-started", "1");
        if (firstOpen.current) return;   // decided once /api/me answers
      }
      localStorage.setItem("gc-last-page", here);
    } catch { /* private mode */ }
  }, [pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!me || !firstOpen.current) return;
    firstOpen.current = false;
    let last: string | null = null;
    try { last = localStorage.getItem("gc-last-page"); } catch { /* private mode */ }
    if (last && last.startsWith("/dashboard/preview") && last !== "/dashboard/preview") {
      const u = new URL(last, window.location.origin);
      const t = tabForUrl(u.pathname, u.search.slice(1));
      if (!t || canSeeTab(me, t.key)) { router.replace(last); return; }
    }
    if (!canSeeTab(me, "my-day") && canSeeTab(me, "team-command")) router.replace("/dashboard/preview/team-command");
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (alive) setMe(d?.user ?? {}); })
      .catch(() => { if (alive) setMe({}); });
    return () => { alive = false; };
  }, []);
  const tab = tabForUrl(pathname, search);
  // Until /api/me answers, and for pages that aren't a switchable tab, just render.
  if (!me || !tab || !me.sections || canSeeTab(me, tab.key)) return <>{children}</>;
  return (
    <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "3rem 1.5rem", background: "#F6F7FB" }}>
      <div style={{ background: "#fff", border: "1px solid #EEF0F4", borderRadius: 16, padding: "2rem 2.2rem", maxWidth: 420, textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#E9ECFB", color: "#3A57E8", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <IconLock size={20} stroke={1.8} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#232D42" }}>{tab.label} isn&apos;t switched on for you</div>
        <div style={{ fontSize: 13, color: "#8A92A6", marginTop: 6, lineHeight: 1.55 }}>Ask an admin to turn it on in Team &amp; access if you need it.</div>
        <Link href={canSeeTab(me, "my-day") ? "/dashboard/preview/my-day" : "/dashboard/preview"} style={{ display: "inline-block", marginTop: 18, background: "#3A57E8", color: "#fff", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>{canSeeTab(me, "my-day") ? "Go to My Day" : "Go to Overview"}</Link>
      </div>
    </main>
  );
}
