import { NextRequest, NextResponse } from "next/server";

const PROTECTED_API_PREFIXES = [
  "/api/insights",
  "/api/posts",
  "/api/audience",
  "/api/ads",
  "/api/competitors",
  "/api/ai-report",
];

export function middleware(req: NextRequest) {
  const session = req.cookies.get("gc_session")?.value;
  const isAuthed = session && session === process.env.SESSION_SECRET;
  const { pathname } = req.nextUrl;

  const isProtected = pathname.startsWith("/dashboard") ||
    PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isAuthed && isProtected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (isAuthed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/api/:path*"] };
