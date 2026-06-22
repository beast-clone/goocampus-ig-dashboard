"use client";
import { DashboardShell } from "@/components/DashboardShell";

const HISTORY = [
  { id: "ai1", title: "Monthly review — May 2026", date: "Jun 1", account: "GooCampus", scope: "30d", summary: "Reels drove 64% of new reach. USMLE content over-indexed; MBBS abroad under-performed. Suggested 3 reel hooks." },
  { id: "ai2", title: "Weekly check — week of Jun 9", date: "Jun 16", account: "GooCampus", scope: "7d", summary: "Follower growth slowed (+2.1% vs +3.8% prior). Engagement dropped on carousels. Recommended posting time shift to 8–9pm IST." },
  { id: "ai3", title: "Cross-account — all 5 pages", date: "Jun 15", account: "All", scope: "30d", summary: "GooCampus main outperformed sibling accounts on saves; partner account 2 had highest reach per follower. Cross-promotion gap identified." },
];

const TEMPLATES = [
  { title: "Monthly management report", desc: "Full month rollup across all 5 accounts with takeaways." },
  { title: "Weekly growth check", desc: "Last 7 days vs prior 7 — what changed and why." },
  { title: "Content type breakdown", desc: "Reels vs carousels vs static — which format won." },
  { title: "Posting time analysis", desc: "Best windows based on engagement and online_followers." },
  { title: "Audience shift report", desc: "Demographic changes month-over-month." },
  { title: "Underperformer diagnosis", desc: "Why specific posts dropped vs your account average." },
];

export default function AIReportsPage() {
  return (
    <DashboardShell title="AI Reports" subtitle="Ask Claude to analyse any slice of your data">
      {() => (
        <>
          <div className="bg-gradient-to-r from-brand to-brand-dark text-white rounded-2xl p-6 mb-6">
            <div className="text-sm opacity-80">Quick generate</div>
            <div className="text-xl font-semibold mt-1">Pick a template or click "Get AI Report" anywhere</div>
            <p className="text-sm opacity-90 mt-2 max-w-2xl">
              Every page has an AI Report button in the top right. Click it to send the current account + date range to Claude
              and get back a structured analysis: what worked, what dropped, why, and 5 next-week actions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {TEMPLATES.map((t) => (
              <div key={t.title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-brand cursor-pointer transition">
                <div className="text-sm font-medium">{t.title}</div>
                <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                <button className="mt-4 text-xs text-brand font-medium">Generate →</button>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 text-sm font-medium">Past reports</div>
            <ul>
              {HISTORY.map((h) => (
                <li key={h.id} className="px-5 py-4 border-b border-gray-50 last:border-0 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{h.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{h.date} · {h.account} · {h.scope}</div>
                    <p className="text-sm text-gray-700 mt-2 max-w-3xl">{h.summary}</p>
                  </div>
                  <button className="text-xs text-brand font-medium whitespace-nowrap">Open →</button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
