import type { ReactNode } from "react";
import { DialogHost } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { ToastHost } from "@/app/(dashboard)/dashboard/preview/Toast";
import { ThemeSync } from "@/components/Theme";

// Every route in this group is auth-gated and renders live data — it is never
// static. Forcing dynamic rendering stops `next build` from trying to prerender
// these pages (which fails on the shared sidebar's client-only `useSearchParams`,
// and on API routes that read `request.url`). Applies to all nested segments.
export const dynamic = "force-dynamic";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  // DialogHost: the dashboard's own confirm/alert/prompt popups (see ConfirmDialog.tsx).
  // ToastHost: the one toast, top centre, for every tab (see Toast.tsx).
  return <>{children}<DialogHost /><ToastHost /><ThemeSync /></>;
}
