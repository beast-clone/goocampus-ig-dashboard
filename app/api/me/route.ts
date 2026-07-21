import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// Returns the currently logged-in team member (from the signed session cookie),
// looked up in the live roster (ind_users, code-list fallback) so members added
// on the Team page work everywhere. Middleware already gated this route (valid
// session required), so a null user here just means a legacy/identity-less session.
export async function GET() {
  const user = await rosterById(getSessionUserId());
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: {
      id: user.id, name: user.name, first: user.first, initials: user.initials, role: user.role,
      isAdmin: user.isAdmin,
      permissions: user.permissions, // per-capability toggles (gate action buttons)
      sections: user.sections,       // per-section page access (gate sidebar tabs)
    },
  });
}
