"use client";
import { usePathname } from "next/navigation";

// Shared components (PlatformOverviews, PlatformAudience, OverviewExtras, …) are
// reused by BOTH the V1 dashboard and the V2 "hope-preview" clones. They hardcode
// V1 hrefs like "/dashboard/facebook". When the user is browsing V2, those links
// must stay inside the hope-preview shell instead of bouncing back to V1.
//
// toV2Href maps a "/dashboard/…" href to "/dashboard/hope-preview/…" ONLY while the
// current path is under hope-preview; under V1 it returns the href unchanged, so V1
// keeps working exactly as before.
export function toV2Href(pathname: string | null, href: string): string {
  if (!href || !href.startsWith("/dashboard")) return href;
  if (!pathname || !pathname.startsWith("/dashboard/hope-preview")) return href;
  if (href.startsWith("/dashboard/hope-preview")) return href;
  return "/dashboard/hope-preview" + href.slice("/dashboard".length);
}

// Hook form for client components: returns a mapper bound to the current path.
export function useV2Href() {
  const pathname = usePathname();
  return (href: string) => toV2Href(pathname, href);
}
