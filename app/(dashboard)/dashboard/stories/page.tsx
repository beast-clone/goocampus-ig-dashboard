"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";

type Story = { id: string; caption: string; mediaUrl: string; permalink: string; timestamp: string };
type StoryWithStats = Story & { views: number; reach: number; replies: number; tapsForward: number; tapsBack: number; exits: number };

// Realistic demo stories so the manager can see what the tab WILL look like once
// n8n's story_insights webhook is wired up. Stats are typical of GooCampus's audience.
const DEMO_STORIES: StoryWithStats[] = [
  { id: "demo-1", caption: "AMC Part 1 prep tip 🇦🇺", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    views: 4287, reach: 4012, replies: 23, tapsForward: 1841, tapsBack: 142, exits: 287 },
  { id: "demo-2", caption: "Behind the scenes — Bangalore ALS workshop", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    views: 3956, reach: 3742, replies: 41, tapsForward: 1623, tapsBack: 89, exits: 198 },
  { id: "demo-3", caption: "Poll: Which pathway are you on?", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    views: 4521, reach: 4287, replies: 312, tapsForward: 1102, tapsBack: 67, exits: 145 },
  { id: "demo-4", caption: "NZ Healthcare Handbook is OUT 📘", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
    views: 5104, reach: 4823, replies: 89, tapsForward: 2014, tapsBack: 156, exits: 234 },
  { id: "demo-5", caption: "Q&A: WBA vs AMC Clinical", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    views: 3812, reach: 3567, replies: 67, tapsForward: 1456, tapsBack: 98, exits: 213 },
  { id: "demo-6", caption: "Student success: Dr. Aisha → AHPRA", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString(),
    views: 4673, reach: 4398, replies: 56, tapsForward: 1789, tapsBack: 112, exits: 245 },
  { id: "demo-7", caption: "Quick fact: IMG job demand 2026", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    views: 3247, reach: 3089, replies: 19, tapsForward: 1234, tapsBack: 78, exits: 167 },
  { id: "demo-8", caption: "Reminder — webinar tomorrow 7 PM IST", mediaUrl: "", permalink: "#", timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    views: 4156, reach: 3934, replies: 124, tapsForward: 1567, tapsBack: 103, exits: 198 },
];

// Soft gradient backgrounds (no external images needed) so the demo grid looks polished.
const DEMO_GRADIENTS = [
  "from-violet-400 to-fuchsia-500",
  "from-blue-400 to-cyan-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-indigo-400 to-purple-500",
  "from-sky-400 to-blue-500",
  "from-green-400 to-emerald-500",
];

export default function StoriesPage() {
  return (
    <DashboardShell title="Stories">
      {({ accountId }) => <StoriesView accountId={accountId} />}
    </DashboardShell>
  );
}

function StoriesView({ accountId }: { accountId: string }) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    fetch(`/api/posts?accountId=${accountId}&limit=50&insights=false`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setStories((d.posts ?? []).filter((p: { type: string }) => p.type === "STORY"));
          setFetchedAt(Date.now());
          setLatencyMs(Date.now() - t0);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use real stories if we have them; otherwise fall back to demo so the tab is never empty
  const showDemo = (stories?.length ?? 0) === 0;
  const displayed: StoryWithStats[] = showDemo ? DEMO_STORIES : (stories ?? []).map((s) => ({
    ...s, views: 0, reach: 0, replies: 0, tapsForward: 0, tapsBack: 0, exits: 0,
  }));

  // Aggregate metrics for the cards at the top
  const totalViews = displayed.reduce((s, x) => s + x.views, 0);
  const totalReach = displayed.reduce((s, x) => s + x.reach, 0);
  const totalReplies = displayed.reduce((s, x) => s + x.replies, 0);
  const avgCompletion = displayed.length
    ? Math.round(displayed.reduce((s, x) => s + (x.views ? ((x.views - x.exits) / x.views) * 100 : 0), 0) / displayed.length)
    : 0;

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />

      {showDemo && !loading && !error && (
        <div className="bg-violet-50 border border-violet-200 text-violet-900 rounded-lg px-4 py-3 mb-6 text-sm">
          📸 <strong>Preview mode</strong> — showing what this tab looks like with live story data.
          Stories expire from Meta&apos;s API 24 hours after posting, so to capture historical metrics we need an n8n
          webhook subscribed to <code className="bg-violet-100 px-1 rounded">story_insights</code> that writes them
          to Airtable before they expire. Once that&apos;s wired, real stories replace this demo automatically.
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">Couldn&apos;t load: {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Stories (24h)" value={displayed.length.toString()} />
        <MetricCard label="Total views" value={totalViews.toLocaleString("en-IN")} />
        <MetricCard label="Total replies" value={totalReplies.toLocaleString("en-IN")} />
        <MetricCard label="Avg completion" value={`${avgCompletion}%`} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-medium">All stories</div>
          <div className="text-xs text-gray-400">Tap a story to open the original frame</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
          {displayed.map((s, i) => {
            const completion = s.views ? Math.round(((s.views - s.exits) / s.views) * 100) : 0;
            const replyRate = s.views ? ((s.replies / s.views) * 100).toFixed(1) : "0.0";
            return (
              <a key={s.id} href={s.permalink} target="_blank" rel="noopener noreferrer" className="group block">
                <div className={`aspect-[9/16] rounded-xl overflow-hidden ${s.mediaUrl ? "bg-gray-100" : `bg-gradient-to-br ${DEMO_GRADIENTS[i % DEMO_GRADIENTS.length]}`} relative ring-1 ring-gray-200 group-hover:ring-2 group-hover:ring-brand transition`}>
                  {s.mediaUrl ? (
                    <img src={s.mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-end p-3 text-white">
                      <div className="text-xs font-medium leading-snug drop-shadow">{s.caption}</div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full">
                    {timeAgo(s.timestamp)}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <Stat label="Views" value={s.views.toLocaleString("en-IN")} />
                    <Stat label="Reach" value={s.reach.toLocaleString("en-IN")} />
                    <Stat label="Replies" value={`${s.replies} (${replyRate}%)`} />
                    <Stat label="Complete" value={`${completion}%`} />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span>→ {s.tapsForward.toLocaleString("en-IN")}</span>
                    <span>← {s.tapsBack.toLocaleString("en-IN")}</span>
                    <span>× {s.exits.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-md px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="font-semibold text-gray-900 truncate">{value}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
