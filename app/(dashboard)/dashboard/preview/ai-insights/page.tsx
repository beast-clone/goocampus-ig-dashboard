"use client";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { AiInsights } from "@/components/AiInsights";
import { IconBrandInstagram, IconSpeakerphone, IconWorldWww } from "@tabler/icons-react";

// Central AI Insights — one Perplexity-powered read that ties together the
// selected account's Instagram + Meta ads + the goocampusevents.com website.
export default function AIInsightsPage() {
  return (
    <PreviewDashboardShell active="ai-insights" title="AI Insights" subtitle="One cross-channel read — Instagram, ads & website — powered by Perplexity.">
      {({ accountId, range }) => (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="text-sm font-semibold text-gray-800 mb-1">Cross-channel action plan</div>
            <p className="text-[13px] text-gray-500 mb-3">
              Pulls <b className="text-gray-700">{accountId}</b>&apos;s live data across three channels and asks Perplexity for a prioritized plan to grow leads — connecting what happens on each.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip icon={IconBrandInstagram} label="Instagram" />
              <Chip icon={IconSpeakerphone} label="Meta ads" />
              <Chip icon={IconWorldWww} label="goocampusevents.com" />
            </div>
            <AiInsights
              endpoint={`/api/ai-insights/overview?accountId=${accountId}&from=${range.from}&to=${range.to}`}
              accent="#3A57E8"
              label="Generate cross-channel insights"
            />
          </div>
        </div>
      )}
    </PreviewDashboardShell>
  );
}

function Chip({ icon: Icon, label }: { icon: typeof IconBrandInstagram; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
      <Icon size={14} stroke={1.8} className="text-gray-400" /> {label}
    </span>
  );
}
