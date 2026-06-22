"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";

const STORIES = [
  { id: "s1", thumb: "📌", caption: "Quick poll: Which country for MBBS?", date: "Today", reach: 4820, replies: 184, exits: 62, taps_forward: 720, taps_back: 88 },
  { id: "s2", thumb: "🎯", caption: "Live Q&A reminder — 7pm IST", date: "Today", reach: 4210, replies: 96, exits: 51, taps_forward: 690, taps_back: 70 },
  { id: "s3", thumb: "📊", caption: "FMGE pass rates — 2025 update", date: "Yesterday", reach: 5340, replies: 142, exits: 78, taps_forward: 820, taps_back: 102 },
  { id: "s4", thumb: "🔔", caption: "New blog: Residency vs PG abroad", date: "Yesterday", reach: 3980, replies: 64, exits: 45, taps_forward: 610, taps_back: 60 },
];

export default function StoriesPage() {
  return (
    <DashboardShell title="Stories">
      {() => (
        <>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
            ⚠️ Stories expire from Meta's API 24 hours after posting. Make sure n8n captures them via webhook before expiry.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Stories (7d)" value="22" delta={10.0} />
            <MetricCard label="Avg reach / story" value="4,580" delta={4.7} />
            <MetricCard label="Avg replies / story" value="124" delta={18.2} />
            <MetricCard label="Exit rate" value="7.8%" delta={-2.1} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100 text-sm font-medium">Recent stories</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3">Story</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Reach</th>
                  <th className="px-3 py-3 text-right">Replies</th>
                  <th className="px-3 py-3 text-right">Taps fwd</th>
                  <th className="px-3 py-3 text-right">Taps back</th>
                  <th className="px-5 py-3 text-right">Exits</th>
                </tr>
              </thead>
              <tbody>
                {STORIES.map((s) => (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-lg">{s.thumb}</div>
                        <div className="truncate max-w-xs">{s.caption}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{s.date}</td>
                    <td className="px-3 py-3 text-right">{s.reach.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{s.replies}</td>
                    <td className="px-3 py-3 text-right">{s.taps_forward}</td>
                    <td className="px-3 py-3 text-right">{s.taps_back}</td>
                    <td className="px-5 py-3 text-right">{s.exits}</td>
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
