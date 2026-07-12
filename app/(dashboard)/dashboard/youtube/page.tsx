"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";

const YT = "#FF0000"; // YouTube red

type Video = {
  id: string; title: string; thumbnail: string;
  views: number; watchHours: number; avgViewDurationSec: number; likes: number; comments: number;
};
type Bar = { label?: string; source?: string; country?: string; device?: string; group?: string; views?: number; value?: number; pct: number };
type Resp = {
  channel: { id: string; name: string; handle: string };
  source: "demo" | "live";
  liveError?: string;
  range: { from: string; to: string };
  latencyMs: number;
  summary: { subscribers: number; subscriberGain: number; views: number; watchHours: number; avgViewDurationSec: number; videos: number };
  viewsOverTime: { date: string; views: number; watchHours: number }[];
  subscribersOverTime: { date: string; subscribers: number; gained: number; lost: number; net: number }[];
  topVideos: Video[];
  traffic: {
    sources: { source: string; views: number; pct: number }[];
    geography: { country: string; views: number; pct: number }[];
    cities?: { city: string; views: number; pct: number }[];
    devices: { device: string; pct: number }[];
    ageGroups: { group: string; pct: number }[];
    genderSplit: { label: string; pct: number }[];
  };
  error?: string;
};

const CHANNELS = [
  { key: "goocampus", label: "GooCampus" },
  { key: "goocampusworld", label: "Study Abroad" },
  { key: "twelfthplus", label: "12thplus" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function YouTubePage() {
  return (
    <DashboardShell title="YouTube" subtitle="Channel analytics — views, watch time, subscribers, audience.">
      {({ range }) => <Inner range={range} />}
    </DashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const [channel, setChannel] = useState("goocampus");
  const qs = new URLSearchParams({ channel, from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(`/api/youtube?${qs}`);
  const [, setFetchedAt] = useState<number | null>(null);
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);

  return (
    <div className="space-y-5">
      {/* Channel switcher + status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === c.key ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
              style={channel === c.key ? { background: YT } : {}}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data?.source === "live" ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
          ) : data?.liveError ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200" title={data.liveError}>⚠ Live call failed · showing demo</span>
          ) : (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="YouTube API not yet connected — showing representative sample data.">⚠ Demo data</span>
          )}
          <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading YouTube analytics…</div>}

      {data && (
        <>
          {/* Summary stat row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Subscribers" value={fmt(data.summary.subscribers)} sub={`${data.summary.subscriberGain >= 0 ? "+" : ""}${fmt(data.summary.subscriberGain)} in range`} accent />
            <Stat label="Views" value={fmt(data.summary.views)} sub="in range" />
            <Stat label="Watch time" value={`${fmt(data.summary.watchHours)} h`} sub="hours watched" />
            <Stat label="Avg view duration" value={duration(data.summary.avgViewDurationSec)} sub="min:sec" />
            <Stat label="Videos" value={String(data.summary.videos)} sub="in top list" />
          </div>

          <Section title="Views & watch time">
            <ViewsChart data={data.viewsOverTime} totalViews={data.summary.views} totalWatch={data.summary.watchHours} />
          </Section>

          <Section title="Subscribers">
            <SubsChart data={data.subscribersOverTime} gain={data.summary.subscriberGain} />
          </Section>

          <Section title="Top videos">
            <VideosTable videos={data.topVideos} />
          </Section>

          <Section title="Traffic & audience">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarCard title="Traffic sources" rows={data.traffic.sources.map((s) => ({ label: s.source, pct: s.pct, sub: fmt(s.views) }))} />
              <BarCard title="Top countries" rows={data.traffic.geography.map((g) => ({ label: g.country, pct: g.pct, sub: fmt(g.views) }))} />
              {(data.traffic.cities?.length ?? 0) > 0 && (
                <BarCard title="Top cities" rows={data.traffic.cities!.map((c) => ({ label: c.city, pct: c.pct, sub: fmt(c.views) }))} />
              )}
              <BarCard title="Devices" rows={data.traffic.devices.map((d) => ({ label: d.device, pct: d.pct }))} />
              <BarCard title="Age & gender" rows={[
                ...data.traffic.ageGroups.map((a) => ({ label: a.group, pct: a.pct })),
                ...data.traffic.genderSplit.map((g) => ({ label: g.label, pct: g.pct, muted: true })),
              ]} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: YT } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-800 mb-2">{title}</div>
      {children}
    </div>
  );
}

function ViewsChart({ data, totalViews, totalWatch }: { data: { date: string; views: number; watchHours: number }[]; totalViews: number; totalWatch: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Views over time</div>
          <div className="text-2xl font-semibold text-gray-900">{totalViews.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">views · {totalWatch.toLocaleString("en-IN")} watch hours</span></div>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ytViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YT} stopOpacity={0.18} />
                <stop offset="100%" stopColor={YT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} width={42} />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; views: number; watchHours: number };
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[150px]">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
                    <div className="text-base font-semibold text-gray-900">{p.views.toLocaleString("en-IN")} views</div>
                    <div className="text-xs text-gray-500">{p.watchHours.toLocaleString("en-IN")} watch hours</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="views" stroke={YT} strokeWidth={2.5} fill="url(#ytViews)" dot={false} activeDot={{ r: 5, fill: YT, stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SubsChart({ data, gain }: { data: { date: string; subscribers: number; gained: number; lost: number; net: number }[]; gain: number }) {
  const peak = data.length ? data.reduce((m, d) => (d.net > m.net ? d : m)) : null;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Subscribers over time</div>
          <div className="text-2xl font-semibold text-gray-900">{gain >= 0 ? "+" : ""}{gain.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">net in range</span></div>
        </div>
        {peak && <div className="text-right text-xs text-gray-500">best day <span className="font-medium text-emerald-600">+{peak.net} on {peak.date}</span></div>}
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ytSubs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0F6E56" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#0F6E56" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} domain={["dataMin - 20", "dataMax + 20"]} width={42} />
            <Tooltip
              cursor={{ stroke: "#cbd5e1" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; subscribers: number; gained: number; lost: number };
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[150px]">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
                    <div className="text-base font-semibold text-gray-900">{p.subscribers.toLocaleString("en-IN")}</div>
                    <div className="text-xs text-emerald-600">+{p.gained} gained</div>
                    <div className="text-xs text-rose-500">−{p.lost} lost</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="subscribers" stroke="#0F6E56" strokeWidth={2.5} fill="url(#ytSubs)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VideosTable({ videos }: { videos: Video[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Video</th>
              <th className="px-3 py-2.5 font-medium text-right">Views</th>
              <th className="px-3 py-2.5 font-medium text-right">Watch hrs</th>
              <th className="px-3 py-2.5 font-medium text-right">Avg view</th>
              <th className="px-3 py-2.5 font-medium text-right">Likes</th>
              <th className="px-3 py-2.5 font-medium text-right">Comments</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={v.id} className={`border-b border-gray-50 ${i === 0 ? "bg-red-50/40" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0 bg-gray-100" />
                      : <div className="w-16 h-9 rounded bg-gray-100 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="truncate text-gray-800 max-w-sm">{v.title}</div>
                      {i === 0 && <div className="text-[11px] text-red-600 font-medium">Top video</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(v.views)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(v.watchHours)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{duration(v.avgViewDurationSec)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(v.likes)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(v.comments)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarCard({ title, rows }: { title: string; rows: { label: string; pct: number; sub?: string; muted?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">{title}</div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-700">{r.label}</span>
              <span className="tabular-nums text-gray-500">{r.pct}%{r.sub ? ` · ${r.sub}` : ""}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(r.pct / max) * 100}%`, background: r.muted ? "#F59E9E" : YT }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
