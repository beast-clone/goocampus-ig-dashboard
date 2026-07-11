import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getUserById } from "@/lib/users";

// Returns the currently logged-in team member (from the signed session cookie).
// Middleware already gated this route (valid session required), so a null user
// here just means a legacy/identity-less session.
export async function GET() {
  const user = getUserById(getSessionUserId());
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: { id: user.id, name: user.name, first: user.first, initials: user.initials, role: user.role, isAdmin: user.isAdmin },
  });
}
