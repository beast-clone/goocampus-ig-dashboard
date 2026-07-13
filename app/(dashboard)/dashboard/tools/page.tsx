"use client";
import { DashboardShell } from "@/components/DashboardShell";

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
    { name: "OpenAI", mark: "AI", color: "#10A37F", purpose: "Insights, reports, captions & summaries" },
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
    <DashboardShell title="Tools" subtitle="The stack behind the Marketing OS — what each tool does." hideAccountPicker>
      {() => (
        <div className="space-y-8">
          <div className="text-xs text-gray-500">{TOTAL} tools across {GROUPS.length} categories.</div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">{g.title}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.tools.map((t) => (
                  <div key={t.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: t.color }}>
                      {t.mark}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                      <div className="text-[12px] text-gray-500 leading-snug mt-0.5">{t.purpose}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
