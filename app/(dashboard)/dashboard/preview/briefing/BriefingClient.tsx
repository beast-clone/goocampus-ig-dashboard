"use client";
import { useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { CompetitorBriefing } from "./CompetitorBriefing";

// Client wrapper — owns the single page header (shell banner) with a live greeting,
// then renders the competitor briefing.
export function BriefingClient({ person }: { person: string }) {
  // Greeting + date depend on `new Date()`, whose value (and locale-formatted
  // string) differs between the Node server render and the browser — which caused
  // a hydration mismatch (e.g. "Saturday 12 September" vs "Saturday, 12 September",
  // or a different day near midnight). Compute them only after mount so the
  // server HTML and the client's first render are identical.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const who = person ? person.charAt(0).toUpperCase() + person.slice(1) : "team";
  const greet = now ? (now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening") : "";
  const date = now ? now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : "";

  return (
    <PreviewDashboardShell active="my-workspace" title={`Competitor radar${greet ? ` · ${greet}, ${who}` : ""}`} hideAccountPicker hideRange
      subtitle={`${date ? `${date} · ` : ""}what the competition is doing — everything here is about them, not us.`}>
      {() => <CompetitorBriefing />}
    </PreviewDashboardShell>
  );
}
