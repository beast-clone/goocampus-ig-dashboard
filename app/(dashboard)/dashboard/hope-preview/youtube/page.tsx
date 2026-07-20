"use client";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import { YT_CHANNEL } from "@/lib/brand-platforms";
import { ChartCard, PieList, AgeGenderPies, regionName } from "@/components/PlatformAudience";
import { IconEye, IconClock, IconThumbUp, IconMessageCircle, IconTrophy } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";

const YT = "#FF0000"; // YouTube red

type Video = {
  id: string; title: string; thumbnail: string;
  views: number; watchHours: number; avgViewDurationSec: number; likes: number; comments: number;
  isShort?: boolean;
};
type Bar = { label?: string; source?: string; country?: string; device?: string; group?: string; views?: number; value?: number; pct: number };
type Resp = {
  channel: { id: string; name: string; handle: string };
  source: "demo" | "live";
  liveError?: string;
  range: { from: string; to: string };
  latencyMs: number;
  summary: { subscribers: number; subscriberGain: number; views: number; watchHours: number; avgViewDurationSec: number; videos: number; avgViewPercentage?: number };
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
    ageGender?: { group: string; male: number; female: number }[];
  };
  bestTimes?: { day: string; time: string; note: string }[];
  error?: string;
};

const CHANNELS = [
  { key: "goocampus", label: "GooCampus" },
  { key: "twelfthplus", label: "12thplus" },
  // Study Abroad (goocampusworld) removed from the switcher — nothing is published there.
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
    <HopeDashboardShell active="youtube" title="YouTube" subtitle="Channel analytics — views, watch time, subscribers, audience.">
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  // Profile mode locks this tab to the brand's own channel — no switcher, no
  // other brand's data reachable. Main mode keeps the free channel switcher.
  const profile = useProfile();
  const profileChannel = profile ? YT_CHANNEL[profile] ?? null : undefined;
  const [picked, setChannel] = useState("goocampus");
  const channel = profile ? (profileChannel ?? "") : picked;
  const qs = new URLSearchParams({ channel, from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(channel ? `/api/youtube?${qs}` : null);
  const [, setFetchedAt] = useState<number | null>(null);
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);

  if (profile && !profileChannel) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center">
        <div className="text-base font-medium text-gray-700 mb-1">No YouTube channel</div>
        <p className="text-sm text-gray-400">This brand doesn&apos;t have a YouTube channel connected to the dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Channel switcher + status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {profile ? (
          <div className="text-base font-medium text-[#232D42]">{CHANNELS.find((c) => c.key === channel)?.label ?? channel} channel</div>
        ) : (
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
        )}
        <div className="flex items-center gap-3">
          {/* When live, the LiveIndicator already says "Live · fetched" — don't
              double it with a second badge. Only flag the non-live states. */}
          {data?.source === "live" ? null : data?.liveError ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200" title={data.liveError}>⚠ Live call failed · showing demo</span>
          ) : (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="YouTube API not yet connected — showing representative sample data.">⚠ Demo data</span>
          )}
          <LiveIndicator loading={isLoading} onRefresh={refresh} />
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

          {data.bestTimes && data.bestTimes.length > 0 && (
            <Section title="Best times to post next">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {data.bestTimes.map((b, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: i === 0 ? YT : "#FBEAEA", color: i === 0 ? "#fff" : YT }}>
                      <IconClock size={22} stroke={1.8} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-[#232D42] leading-tight">{b.day}</div>
                      <div className="text-sm text-[#3B4457]">{b.time}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{b.note}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-gray-400 mt-2">Day is from your real view data (the weekdays your videos pull the most views). Time is a suggested posting window — YouTube doesn&apos;t share hour-level audience activity like Instagram does.</div>
            </Section>
          )}

          {(() => {
            const tv = data.topVideos || [];
            const totViews = tv.reduce((s, v) => s + v.views, 0);
            const totEng = tv.reduce((s, v) => s + v.likes + v.comments, 0);
            const engRate = totViews ? (totEng / totViews) * 100 : 0;
            const shortViews = tv.filter((v) => v.isShort).reduce((s, v) => s + v.views, 0);
            const longViews = tv.filter((v) => !v.isShort).reduce((s, v) => s + v.views, 0);
            const splitTotal = shortViews + longViews;
            const shortPct = splitTotal ? Math.round((shortViews / splitTotal) * 100) : 0;
            const hasSplit = tv.some((v) => typeof v.isShort === "boolean") && splitTotal > 0;
            return (
              <Section title="Engagement & retention">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Avg % viewed</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: YT }}>{data.summary.avgViewPercentage != null ? `${data.summary.avgViewPercentage}%` : "—"}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">how much of each video people watch</div>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Engagement rate</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-[#232D42]">{engRate.toFixed(1)}%</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{fmt(totEng)} likes + comments · on top videos</div>
                  </div>
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Shorts vs Long-form</div>
                    {hasSplit ? (
                      <>
                        <div className="mt-2.5 h-2.5 rounded-full bg-[#F3F5FA] overflow-hidden flex">
                          <span className="h-full" style={{ width: `${shortPct}%`, background: YT }} />
                          <span className="h-full" style={{ width: `${100 - shortPct}%`, background: "#F3B7B7" }} />
                        </div>
                        <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
                          <span>Shorts {shortPct}%</span>
                          <span>Long-form {100 - shortPct}%</span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">share of views · on top videos</div>
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-gray-400">Not enough data</div>
                    )}
                  </div>
                </div>
              </Section>
            );
          })()}

          <Section title="Views & watch time">
            <ViewsChart data={data.viewsOverTime} totalViews={data.summary.views} totalWatch={data.summary.watchHours} />
          </Section>

          <Section title="Subscribers">
            <SubsChart data={data.subscribersOverTime} gain={data.summary.subscriberGain} />
          </Section>

          <Section title="Top videos">
            <VideoCards videos={data.topVideos} />
          </Section>

          <Section title="Traffic & audience">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <ChartCard title="Traffic sources" hint="views" empty={!data.traffic.sources.length}>
                <PieList color={YT} unit="views" data={data.traffic.sources.slice(0, 8).map((s) => ({ name: s.source, value: s.views }))} />
              </ChartCard>
              <ChartCard title="Top countries" hint="views" empty={!data.traffic.geography.length}>
                <PieList color={YT} unit="views" data={data.traffic.geography.slice(0, 8).map((g) => ({ name: regionName(g.country), value: g.views }))} />
              </ChartCard>
              <ChartCard title="Top cities" hint="views · Google hides small cities" empty={!(data.traffic.cities?.length ?? 0)}>
                <PieList color={YT} unit="views" data={(data.traffic.cities ?? []).slice(0, 8).map((c) => ({ name: c.city, value: c.views }))} />
              </ChartCard>
              <ChartCard title="Devices" hint="% of views" empty={!data.traffic.devices.length}>
                <PieList color={YT} unit="%" data={data.traffic.devices.map((d) => ({ name: d.device, value: d.pct }))} />
              </ChartCard>
              <ChartCard title="Age & gender" hint="% of viewers in range" empty={!data.traffic.ageGroups.length && !data.traffic.genderSplit.length}>
                <AgeGenderPies ageGroups={data.traffic.ageGroups} genderSplit={data.traffic.genderSplit} />
              </ChartCard>
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
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: YT } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-base font-medium text-[#232D42] mb-2">{title}</div>
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
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
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
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
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

function VideoCards({ videos }: { videos: Video[] }) {
  const Metric = ({ icon: Ico, value, label }: { icon: typeof IconEye; value: string; label: string }) => (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 tabular-nums" title={label}>
      <Ico size={13} stroke={1.8} className="text-gray-400" />
      {value}
    </span>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.slice(0, 12).map((v, i) => (
        <a
          key={v.id}
          href={`https://www.youtube.com/watch?v=${v.id}`}
          target="_blank"
          rel="noreferrer"
          className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-sm transition block"
        >
          <div className="relative bg-gray-100 aspect-video">
            {v.thumbnail
              ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
              : <div className="w-full h-full" />}
            <span className="absolute top-2 left-2 text-xs font-semibold bg-white/90 rounded-full px-2 py-0.5 text-gray-700">#{i + 1}</span>
            {i === 0 && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs font-semibold text-white rounded-full px-2 py-0.5" style={{ background: YT }}>
                <IconTrophy size={11} stroke={2} /> Top video
              </span>
            )}
          </div>
          <div className="p-3">
            <div className="text-[13px] text-gray-900 leading-snug line-clamp-2 min-h-[2.4rem]">{v.title}</div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Metric icon={IconEye} value={fmt(v.views)} label="Views" />
              <Metric icon={IconClock} value={`${fmt(v.watchHours)}h · ${duration(v.avgViewDurationSec)} avg`} label="Watch time · avg view" />
              <Metric icon={IconThumbUp} value={fmt(v.likes)} label="Likes" />
              <Metric icon={IconMessageCircle} value={fmt(v.comments)} label="Comments" />
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

