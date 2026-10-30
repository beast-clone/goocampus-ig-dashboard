"use client";
import { useEffect, useState } from "react";
import { IconKey, IconCopy, IconCheck, IconAlertTriangle, IconDatabase, IconBrandInstagram, IconWorld, IconSparkles, IconSearch, IconUsers, IconBell, IconServer2, type Icon } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { showToast } from "../Toast";

// System → API keys (30 Oct): every outside service Marketing OS holds a key for, what
// it's used for, and whether it's set. Names only (lib/api-keys-registry.ts).

type Key = { group: string; service: string; use: string; unused?: boolean; set: boolean; envStatus: { name: string; set: boolean }[]; dbSet: string[] };
const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";
const GROUP_ICON: Record<string, Icon> = {
  "Social accounts": IconBrandInstagram, Website: IconWorld, AI: IconSparkles, "Research & competitors": IconSearch,
  "Leads, sales & messages": IconUsers, "Email & notifications": IconBell, "Dashboard itself": IconServer2,
};

export default function ApiKeysPage() {
  return (
    <PreviewDashboardShell active="api-keys" title="API keys" hideAccountPicker hideRange
      subtitle="Every outside service Marketing OS connects to, what it's used for, and whether its key is set.">
      {() => <ApiKeys />}
    </PreviewDashboardShell>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/api-keys", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setKeys(j.keys);
    }).catch((e) => setErr((e as Error).message));
  }, []);
  if (err) return <div className="preview-scope"><div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[14px] text-[#8A92A6]">Couldn&apos;t load the list: {err}</div></div>;
  if (!keys) return <div className="preview-scope"><div className="bg-white border border-gray-100 rounded-2xl"><LoadingBlock /></div></div>;

  const groups = [...new Set(keys.map((k) => k.group))];
  const used = keys.filter((k) => !k.unused);
  const copyList = async () => {
    const text = ["Marketing OS — API keys and what they're used for", ""].concat(groups.flatMap((g) => [
      `*${g}*`,
      ...keys.filter((k) => k.group === g).map((k) => `• ${k.service}${k.unused ? " (not used)" : ""} — ${k.use}`),
      "",
    ])).join("\n").trim();
    try { await navigator.clipboard.writeText(text); showToast({ who: "List copied", body: "Paste it in WhatsApp, Slack or an email. No key values are included.", av: "✓" }); }
    catch { window.prompt("Copy this list:", text); }
  };

  return (
    <div className="preview-scope space-y-5">
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
        <span className="w-10 h-10 rounded-xl bg-brand-light text-brand grid place-items-center"><IconKey size={20} stroke={1.8} /></span>
        <div className="flex-1 min-w-0">
          <div className={`text-[15px] font-medium ${INK}`}>{used.length} services · {used.filter((k) => k.set).length} set up</div>
          <div className={`text-[12.5px] ${MUTED}`}>Key values are never shown here — only their names. Change a key in Netlify&apos;s settings (or reconnect it on Diagnostics / Brands).</div>
        </div>
        <button onClick={() => void copyList()} className="h-10 px-4 rounded-[10px] bg-brand text-white inline-flex items-center gap-1.5 text-[14px] font-medium hover:bg-brand-dark"><IconCopy size={16} stroke={1.8} />Copy as a list</button>
      </div>

      {groups.map((g) => {
        const GI = GROUP_ICON[g] || IconKey;
        return (
          <section key={g} className="bg-white border border-gray-100 rounded-2xl">
            <div className="flex items-center gap-2 px-5 pt-4 pb-2">
              <GI size={18} stroke={1.8} className="text-brand" />
              <span className={`text-[15px] font-medium ${INK}`}>{g}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {keys.filter((k) => k.group === g).map((k) => (
                <div key={k.service} className="px-5 py-3.5 grid gap-3 grid-cols-1 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_120px] items-start">
                  <div>
                    <div className={`text-[14px] font-medium ${INK}`}>{k.service}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {k.envStatus.map((e) => (
                        <code key={e.name} title={e.set ? "Set" : "Not set"} className={`text-[11px] rounded px-1.5 py-0.5 ${e.set ? "bg-[#F0F2F8] text-[#4A5468]" : "bg-white border border-dashed border-gray-200 text-[#B8BECC]"}`}>{e.name}</code>
                      ))}
                      {k.dbSet.map((d) => (
                        <code key={d} title="Saved in the database (connected from the dashboard)" className="text-[11px] rounded px-1.5 py-0.5 bg-brand-light text-brand inline-flex items-center gap-1"><IconDatabase size={11} stroke={1.8} />{d}</code>
                      ))}
                    </div>
                  </div>
                  <div className={`text-[13px] leading-relaxed text-[#4A5468]`}>{k.use}</div>
                  <div className="md:text-right">
                    {k.unused ? <span className="inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-1 bg-[#FFF4E5] text-[#9A5B10]"><IconAlertTriangle size={13} stroke={1.8} />Not used</span>
                      : k.set ? <span className="inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-1 bg-[#E3F5EA] text-[#137A3E]"><IconCheck size={13} stroke={2} />Set up</span>
                      : <span className="inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-1 bg-[#F0F2F8] text-[#4A5468]">Not set</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
