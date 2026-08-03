"use client";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import {
  MasterTab, TeamView, PipelineView, CalendarView, DetailModal,
  ownerMatchesKey, ymd, type Data,
} from "../marketing-hub/MarketingHub";

export type MemberTab = "team" | "master" | "pipeline" | "calendar";

// The four Marketing-Hub views (Workload / Master sheet / Pipeline / Content calendar)
// embedded into My Workspace, but LOCKED to one member — the logged-in person. It reuses
// the exact admin Hub components; only the data is pre-filtered by owner, so a member sees
// only their own tasks and never the team-wide Hub or a person-picker.
export function MemberHub({ person, tab }: { person: string; tab: MemberTab }) {
  const [range, setRange] = useState(() => ({
    from: ymd(new Date(Date.now() - 30 * 86_400_000)),
    to: ymd(new Date()),
  }));
  // Same fetch-window logic the Hub uses: the calendar looks far forward, Workload a
  // week ahead, the rest use the retrospective range.
  const fetchRange =
    tab === "calendar"
      ? { from: ymd(new Date(Date.now() - 180 * 86_400_000)), to: ymd(new Date(Date.now() + 365 * 86_400_000)) }
      : tab === "team"
      ? { from: range.from, to: ymd(new Date(Date.now() + 7 * 86_400_000)) }
      : range;
  const qs = new URLSearchParams({ from: fetchRange.from, to: fetchRange.to }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);

  const scoped = useMemo(
    () => (data?.rows || []).filter((r) => ownerMatchesKey(r.owner, person)),
    [data, person],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = openId ? scoped.find((r) => r.id === openId) || null : null;

  return (
    <div className="hope-scope space-y-6">
      {tab === "master" && (
        <MasterTab allRows={scoped} facets={data?.facets} range={range} setRange={setRange} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
      )}
      {tab === "team" && (
        <TeamView rows={scoped} allRows={scoped} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
      )}
      {tab === "pipeline" && (
        <PipelineView rows={scoped} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
      )}
      {tab === "calendar" && (
        <CalendarView rows={scoped} facets={data?.facets} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
      )}
      {openRow && <DetailModal row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  );
}
