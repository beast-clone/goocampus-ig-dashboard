"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";

const POSTS = [
  { id: "p1", thumb: "🎓", caption: "5 things to know before MBBS abroad…", date: "Jun 18", type: "Carousel", reach: 18420, likes: 1284, comments: 92, shares: 47, saves: 218, eng: 1641 },
  { id: "p2", thumb: "🩺", caption: "USMLE Step 1 — preparation roadmap", date: "Jun 16", type: "Reel", reach: 32100, likes: 2105, comments: 184, shares: 312, saves: 540, eng: 3141 },
  { id: "p3", thumb: "🌍", caption: "Top 7 countries for IMGs in 2026", date: "Jun 14", type: "Carousel", reach: 14250, likes: 980, comments: 64, shares: 38, saves: 165, eng: 1247 },
  { id: "p4", thumb: "💡", caption: "FMGE vs NEXT — what changes for you", date: "Jun 12", type: "Static", reach: 9870, likes: 612, comments: 41, shares: 18, saves: 73, eng: 744 },
  { id: "p5", thumb: "📚", caption: "Why your CV format matters in residency apps", date: "Jun 10", type: "Reel", reach: 21340, likes: 1450, comments: 110, shares: 195, saves: 320, eng: 2075 },
  { id: "p6", thumb: "✈️", caption: "Moving to Georgia for MBBS — full cost breakdown", date: "Jun 8", type: "Carousel", reach: 16780, likes: 1102, comments: 78, shares: 56, saves: 240, eng: 1476 },
];

export default function PostsPage() {
  return (
    <DashboardShell title="Posts">
      {() => (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Posts (30d)" value="14" delta={16.7} />
            <MetricCard label="Avg Reach / post" value="18,760" delta={8.2} />
            <MetricCard label="Avg Engagement" value="1,720" delta={-3.4} />
            <MetricCard label="Top performer" value="USMLE Step 1" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-medium">All posts</div>
              <div className="flex gap-2">
                <select className="text-xs border border-gray-200 rounded-md px-2 py-1">
                  <option>All types</option><option>Reels</option><option>Carousel</option><option>Static</option>
                </select>
                <select className="text-xs border border-gray-200 rounded-md px-2 py-1">
                  <option>Sort: Reach</option><option>Engagement</option><option>Date</option>
                </select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3">Post</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Reach</th>
                  <th className="px-3 py-3 text-right">Likes</th>
                  <th className="px-3 py-3 text-right">Comments</th>
                  <th className="px-3 py-3 text-right">Shares</th>
                  <th className="px-3 py-3 text-right">Saves</th>
                  <th className="px-5 py-3 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {POSTS.map((p) => (
                  <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg">{p.thumb}</div>
                        <div className="truncate max-w-xs">{p.caption}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{p.type}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{p.date}</td>
                    <td className="px-3 py-3 text-right">{p.reach.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{p.likes.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{p.comments}</td>
                    <td className="px-3 py-3 text-right">{p.shares}</td>
                    <td className="px-3 py-3 text-right">{p.saves}</td>
                    <td className="px-5 py-3 text-right font-medium">{p.eng.toLocaleString()}</td>
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
