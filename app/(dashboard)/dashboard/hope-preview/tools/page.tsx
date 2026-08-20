"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";

// The stack behind the Marketing OS. Monogram tiles (brand colour + short mark)
// instead of external logo images — so the page works offline and never trips the
// CSP. Easy to edit: add/remove a { name, mark, color, purpose } to any group.
type Tool = { name: string; mark: string; color: string; purpose: string };
type Group = { title: string; tools: Tool[] };

const GROUPS: Group[] = [
  { title: "Data & storage", tools: [
    { name: "Airtable", mark: "A", color: "#E0900B", purpose: "Content calendar, sales CRM, lead capture & mapping tables" },
    { name: "Supabase", mark: "Sb", color: "#2BB673", purpose: "Dashboard database — posts, users, comments, cache" },
    { name: "Pinecone", mark: "P", color: "#0E9488", purpose: "Vector store for the AI counsellor's knowledge base" },
  ] },
  { title: "Automation", tools: [
    { name: "n8n", mark: "n8", color: "#E24C6E", purpose: "Workflow engine — lead routing, scheduling, notifications, voucher & report generation" },
  ] },
  { title: "Platform APIs", tools: [
    { name: "Meta Graph API", mark: "M", color: "#0866FF", purpose: "Instagram + Facebook analytics" },
    { name: "Meta Marketing API", mark: "Ad", color: "#1877F2", purpose: "Ad spend, performance & breakdowns" },
    { name: "YouTube Data API", mark: "YT", color: "#FF0000", purpose: "Channel & video analytics" },
    { name: "LinkedIn API", mark: "in", color: "#0A66C2", purpose: "Company page analytics & posting" },
  ] },
  { title: "Scraping & enrichment", tools: [
    { name: "Apify", mark: "Ap", color: "#6FA100", purpose: "Competitor & media scraping" },
    { name: "HikerAPI", mark: "Hk", color: "#6366F1", purpose: "Instagram data enrichment" },
  ] },
  { title: "AI", tools: [
    { name: "Perplexity", mark: "Px", color: "#20808D", purpose: "Insights, reports, captions & summaries (web-grounded)" },
    { name: "Whisper", mark: "W", color: "#6B7280", purpose: "Voice-note → text transcription" },
  ] },
  { title: "Media & generation", tools: [
    { name: "Placid", mark: "Pl", color: "#4F46E5", purpose: "Voucher & graphic generation (PDF / PNG)" },
    { name: "CloudConvert", mark: "CC", color: "#2E6BE6", purpose: "Audio & file format conversion" },
  ] },
  { title: "Messaging & notifications", tools: [
    { name: "Telegram", mark: "Tg", color: "#229ED9", purpose: "Team alerts & claim buttons" },
    { name: "WhatsApp", mark: "Wa", color: "#1FA855", purpose: "Lead & team notifications" },
    { name: "SendPulse", mark: "SP", color: "#E8452B", purpose: "Email & messaging automation" },
  ] },
  { title: "Payments", tools: [
    { name: "Razorpay", mark: "R", color: "#0C2451", purpose: "Payment webhooks — auto access-grant on purchase" },
  ] },
  { title: "Build & hosting", tools: [
    { name: "Next.js", mark: "Nx", color: "#111827", purpose: "The dashboard framework (React)" },
    { name: "Netlify", mark: "N", color: "#0FA69A", purpose: "Hosting & continuous deploy" },
  ] },
];

const TOTAL = GROUPS.reduce((s, g) => s + g.tools.length, 0);

export default function ToolsPage() {
  return (
    <HopeDashboardShell active="tools" title="Tools" subtitle="The stack behind the Marketing OS — what each tool does." hideAccountPicker>
      {() => (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="text-sm text-gray-500 mb-4">{TOTAL} tools across {GROUPS.length} categories.</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="py-2.5 pr-4 font-normal text-left text-[11px] uppercase tracking-wide">Tool</th>
                  <th className="py-2.5 pl-3 font-normal text-left text-[11px] uppercase tracking-wide">What it does</th>
                </tr>
              </thead>
              {/* One tbody per category — the group is a banded header row rather than a
                  repeated chip on every line, and a category with one tool costs one row. */}
              {GROUPS.map((g) => (
                <tbody key={g.title}>
                  <tr className="bg-gray-50 border-y border-gray-100">
                    <td colSpan={2} className="py-2 pr-4 pl-0">
                      <span className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">{g.title}</span>
                      <span className="text-[11px] text-gray-400 ml-2">{g.tools.length}</span>
                    </td>
                  </tr>
                  {g.tools.map((t) => (
                    <tr key={t.name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-2.5">
                          {/* Monogram, not a logo file — works offline and never trips the CSP. */}
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-semibold text-[11px] flex-shrink-0"
                            style={{ background: t.color }}>{t.mark}</span>
                          <span className="font-medium text-[#232D42] whitespace-nowrap">{t.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-gray-500">{t.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      )}
    </HopeDashboardShell>
  );
}
