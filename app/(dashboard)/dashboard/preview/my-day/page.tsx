import { PreviewMyDay } from "./PreviewMyDay";
import { getSessionUserId, getSessionIsAdmin } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// Dashboard reskin — My Day (Version 2 preview). Self-contained: its own Themed
// shell + the full decluttered My Day layout. Does not touch the shared
// Sidebar/DashboardShell or the original components/MyDayView.tsx (Version 1).
// (Inter is loaded globally in app/layout.tsx.)

// Reads the real logged-in identity so each teammate opens THEIR own day.
// Producers are locked to themselves (no profile-switcher); admins (Maheen /
// the owner) keep the switcher to view any teammate's day.
export const dynamic = "force-dynamic";

export default async function PreviewMyDayPage({ searchParams }: { searchParams?: { person?: string } }) {
  const uid = getSessionUserId();
  const admin = getSessionIsAdmin();
  // The Team page roster, not lib/users.ts — else someone added there opens as Manya.
  const user = await rosterById(uid);
  // A producer opens their own day (locked). An admin has no producer day of
  // their own, so they land on a default producer view + get the switcher — and
  // may deep-link a specific person via ?person= (e.g. from Team Command's
  // "View their day"). Producers can never override who they are.
  const wanted = admin && typeof searchParams?.person === "string" ? searchParams.person.toLowerCase().trim() : undefined;
  const initialPerson = wanted || (user && !admin ? user.id : undefined);
  return <PreviewMyDay initialPerson={initialPerson} isAdmin={admin} viewerId={uid || undefined} />;
}
