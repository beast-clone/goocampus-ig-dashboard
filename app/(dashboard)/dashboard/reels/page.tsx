"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";

const REELS = [
  { id: "r1", thumb: "🎬", caption: "USMLE Step 1 — preparation roadmap", date: "Jun 16", views: 92400, watch: "00:14", reach: 32100, likes: 2105, comments: 184, shares: 312, saves: 540 },
  { id: "r2", thumb: "🩻", caption: "Day in the life of an IMG in the US", date: "Jun 13", views: 78200, watch: "00:21", reach: 28430, likes: 1820, comments: 152, shares: 268, saves: 410 },
  { id: "r3", thumb: "📖", caption: "5 myths about MBBS abroad", date: "Jun 11", views: 64500, watch: "00:11", reach: 23100, likes: 1540, comments: 98, shares: 184, saves: 290 },
  { id: "r4", thumb: "🏥", caption: "Residency interview — what to wear", date: "Jun 9", views: 51200, watch: "00:18", reach: 19840, likes: 1280, comments: 76, shares: 122, saves: 215 },
  { id: "r5", thumb: "🌐", caption: "MCI screening test — passing strategy", date: "Jun 7", views: 47300, watch: "00:16", reach: 18120, likes: 1140, comments: 68, shares: 95, saves: 180 },
];

const reelTrend = Array.from({ length: 14 }, (_, i) => ({
  date: `Jun ${i + 5}`,
  views: 30000 + Math.round(Math.sin(i / 2) * 15000) + i * 2200,
  engagement: 800 + Math.round(Math.cos(i / 2) * 200) + i * 30,
}));

export default function ReelsPage() {
  return (
    <DashboardShell title="Reels">
      {() => (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Reels (30d)" value="9" delta={28.6} />
            <MetricCard label="Total views" value="487K" delta={22.4} />
            <MetricCard label="Avg watch time" value="16s" delta={5.3} />
            <MetricCard label="Avg shares / reel" value="196" delta={11.8} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <TrendChart title="Reel views over time" data={reelTrend} dataKey="views" />
            <TrendChart title="Reel engagement over time" data={reelTrend} dataKey="engagement" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 text-sm font-medium">Top reels</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3">Reel</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Views</th>
                  <th className="px-3 py-3 text-right">Avg watch</th>
                  <th className="px-3 py-3 text-right">Reach</th>
                  <th className="px-3 py-3 text-right">Likes</th>
                  <th className="px-3 py-3 text-right">Shares</th>
                  <th className="px-5 py-3 text-right">Saves</th>
                </tr>
              </thead>
              <tbody>
                {REELS.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-lg">{r.thumb}</div>
                        <div className="truncate max-w-xs">{r.caption}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{r.date}</td>
                    <td className="px-3 py-3 text-right">{r.views.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{r.watch}</td>
                    <td className="px-3 py-3 text-right">{r.reach.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{r.likes.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{r.shares}</td>
                    <td className="px-5 py-3 text-right">{r.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
