import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("gc_session")?.value;
  const isAuthed = session && session === process.env.SESSION_SECRET;
  const { pathname } = req.nextUrl;

  if (!isAuthed && (pathname.startsWith("/dashboard") || pathname.startsWith("/api/insights") || pathname.startsWith("/api/posts") || pathname.startsWith("/api/ai-report"))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isAuthed && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/api/:path*"] };
