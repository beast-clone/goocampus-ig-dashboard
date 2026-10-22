"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
        <Link href="/dashboard/preview/my-day" style={{ display: "inline-block", marginTop: 18, background: "#3A57E8", color: "#fff", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>Go to My Day</Link>
      </div>
    </main>
  );
}
