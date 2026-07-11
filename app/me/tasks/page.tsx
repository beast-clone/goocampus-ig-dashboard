"use client";
import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { MyDayView, MY_DAY_TEAM_KEYS } from "@/components/MyDayView";

// Each member's own tasks page — the same My Day view the admin dashboard has,
// but locked to whoever is signed in. No person switcher, no admin sidebar.
// Members land here from /me ("Tasks" in the rail / "My tasks →" in the banner).

type Me = { id: string; name: string; first: string; role: string; isAdmin: boolean };

export default function MemberTasksPage() {
  // undefined = still checking who's signed in
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        const u: Me | null = d?.user ?? null;
        if (!u) { window.location.href = "/login?next=/me/tasks"; return; }
        if (u.isAdmin) { window.location.href = "/dashboard/my-day"; return; }
        setMe(u);
      })
      .catch(() => { window.location.href = "/login?next=/me/tasks"; });
  }, []);

  if (me === undefined || me === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
        Loading your tasks…
      </div>
    );
  }

  const range = {
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  };

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="flex items-center gap-4 mb-5">
          <a href="/me" className="text-sm font-medium text-brand bg-brand-light rounded-lg px-3 py-1.5 hover:bg-brand/20">
            ← My dashboard
          </a>
          <div>
            <h1 className="text-xl font-semibold leading-tight">My tasks</h1>
            <p className="text-xs text-gray-500">Everything assigned to you — click a task to work on it.</p>
          </div>
        </div>

        {MY_DAY_TEAM_KEYS.includes(me.id) ? (
          <MyDayView range={range} lockedPersonKey={me.id} />
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-sm text-gray-500">
            Your personal task view isn&apos;t set up yet — ask Maheen to add you to the My Day team.
          </div>
        )}
      </div>
    </div>
  );
}
