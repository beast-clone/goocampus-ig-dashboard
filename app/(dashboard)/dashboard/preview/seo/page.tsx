"use client";
import { useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useApi } from "@/lib/use-api";
import {
  IconSparkles, IconCopy, IconCheck, IconBrandInstagram, IconBrandYoutube, IconTrendingUp,
  IconTrophy, IconTargetArrow, IconUsers, IconRefresh, IconAlertTriangle,
} from "@tabler/icons-react";

// SEO for Instagram & YouTube — doctors only. Replaces the old website/Google SEO tab.
//   1. Generate: paste a caption or script → keywords, hashtags, tags to copy.
//   2. Trending doctor keywords: what doctor-education accounts actually use, ranked.
//   3. Working for us / gaps: our best keywords, and ones competitors use that we don't.
//   4. Who we compare with.
// All numbers are real (lib/social-keywords.ts) — no invented search volumes.

type Platform = "instagram" | "youtube";
type Row = {
  keyword: string; kind: "hashtag" | "keyword"; platform: Platform; accounts: number; competitors: string[];
  posts: number; avgEngagement: number; oursPosts: number; oursAvgEngagement: number | null;
};
type Account = { platform: Platform; account: string; name?: string; followers?: number; analysed: number; error?: string };
type Data = { instagram: Row[]; youtube: Row[]; accounts: Account[]; oursAvg: { instagram: number | null; youtube: number | null }; fetchedAt: string; error?: string };
type Gen = { platform: Platform; keywords: string[]; hashtags: string[]; tags?: string[]; titles?: string[]; error?: string };

const fmt = (n: number | null | undefined) => (n == null ? "—" : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString("en-IN"));
const engLabel = (p: Platform) => (p === "youtube" ? "views per video" : "likes + comments per post");

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-gray-200 text-[14px] text-[#4A5468] hover:border-brand hover:text-brand flex-shrink-0">
      {done ? <IconCheck size={15} stroke={2} className="text-[#2F9E6F]" /> : <IconCopy size={15} stroke={1.8} />}{done ? "Copied" : label}
    </button>
  );
}

// A keyword chip — click to copy just that one.
function Chip({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1200); } }} title="Click to copy"
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[14px] transition ${done ? "border-[#2F9E6F] text-[#2F9E6F] bg-[#E8F6F0]" : "border-gray-200 text-[#232D42] bg-white hover:border-brand"}`}>
      {done && <IconCheck size={13} stroke={2} />}{text}
    </button>
  );
}

function Card({ icon, title, sub, right, children }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-xl">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
        <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-[#232D42]">{title}</div>
          {sub && <div className="text-[12px] text-[#8A92A6] mt-0.5">{sub}</div>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PlatformToggle({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="inline-flex bg-[#F6F7FB] border border-gray-100 rounded p-0.5 gap-0.5">
      {(["instagram", "youtube"] as Platform[]).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`h-9 px-3 rounded text-[14px] font-medium inline-flex items-center gap-1.5 ${value === p ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
          {p === "instagram" ? <IconBrandInstagram size={16} stroke={1.8} /> : <IconBrandYoutube size={16} stroke={1.8} />}
          {p === "instagram" ? "Instagram" : "YouTube"}
        </button>
      ))}
    </div>
  );
}

export default function SeoPage() {
  return (
    <PreviewDashboardShell active="seo" title="SEO" hideAccountPicker hideRange
      subtitle="Keywords and hashtags for Instagram and YouTube — for doctors, from our posts and our competitors'.">
      {() => <Inner />}
    </PreviewDashboardShell>
  );
}

function Inner() {
  const [key, setKey] = useState("/api/seo/social");
  const { data, error, isLoading } = useApi<Data>(key);
  return (
    <div className="preview-scope space-y-4">
      <Generator />
      {error ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-[14px] text-rose-600">Couldn&apos;t load keyword data: {error.message}</div>
      ) : !data ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6"><LoadingBlock label={isLoading ? "Reading our posts and 9 competitors' — this takes a moment the first time…" : undefined} /></div>
      ) : (
        <>
          <Trending data={data} />
          <OursAndGaps data={data} />
          <Competitors data={data} onRefresh={() => setKey(`/api/seo/social?fresh=1&t=${Date.now()}`)} />
        </>
      )}
    </div>
  );
}

// ── 1. Generate ────────────────────────────────────────────────────────────
function Generator() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Gen | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null); setOut(null);
    try {
      const r = await fetch("/api/seo/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Couldn't generate keywords."); return; }
      setOut(j);
    } catch { setErr("Lost connection — try again."); } finally { setBusy(false); }
  };
  const groups: { label: string; items: string[]; join: string }[] = out ? [
    ...(out.titles?.length ? [{ label: "Title ideas", items: out.titles, join: "\n" }] : []),
    { label: platform === "youtube" ? "Search keywords" : "Keywords to use in the caption", items: out.keywords, join: ", " },
    ...(out.tags?.length ? [{ label: "YouTube tags", items: out.tags, join: ", " }] : []),
    { label: "Hashtags", items: out.hashtags, join: " " },
  ].filter((g) => g.items.length) : [];
  return (
    <Card icon={<IconSparkles size={17} stroke={1.8} />} title="Generate keywords"
      sub="Paste an Instagram caption or a YouTube script — get keywords and hashtags to copy into the post."
      right={<PlatformToggle value={platform} onChange={(p) => { setPlatform(p); setOut(null); }} />}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder={platform === "youtube" ? "Paste the video script or description…" : "Paste the post caption…"}
        className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-brand resize-y" />
      <div className="flex items-center gap-3 mt-3">
        <button onClick={run} disabled={busy || text.trim().length < 20}
          className="h-9 px-4 rounded bg-brand text-white text-[14px] font-medium inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-40">
          <IconSparkles size={16} stroke={1.8} />{busy ? "Generating…" : "Generate keywords"}
        </button>
        <span className="text-[12px] text-[#8A92A6]">Uses what&apos;s working on doctor-education {platform === "youtube" ? "YouTube" : "Instagram"} today.</span>
      </div>
      {err && <div className="mt-3 rounded bg-[#FDECEA] text-[#8a2e28] text-[14px] px-3 py-2">{err}</div>}
      {groups.length > 0 && (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-medium text-[#8A92A6] uppercase tracking-wide">{g.label}</div>
                <CopyButton text={g.items.join(g.join)} label="Copy all" />
              </div>
              <div className="flex flex-wrap gap-2">{g.items.map((x) => <Chip key={x} text={x} />)}</div>
            </div>
          ))}
          <div className="text-[12px] text-[#8A92A6]">Click any chip to copy just that one.</div>
        </div>
      )}
    </Card>
  );
}

// ── 2. Trending doctor keywords ────────────────────────────────────────────
function Trending({ data }: { data: Data }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [kind, setKind] = useState<"all" | "hashtag" | "keyword">("all");
  const competitorCount = data.accounts.filter((a) => a.platform === platform && a.analysed > 0).length;
  const rows = data[platform].filter((r) => kind === "all" || r.kind === kind).slice(0, 30);
  const topHashtags = data[platform].filter((r) => r.kind === "hashtag").slice(0, 20).map((r) => r.keyword);
  return (
    <Card icon={<IconTrendingUp size={17} stroke={1.8} />} title="Trending doctor keywords"
      sub={`Ranked by how many of the ${competitorCount} accounts we track use them, then by how well those posts do (${engLabel(platform)}).`}
      right={<PlatformToggle value={platform} onChange={setPlatform} />}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(["all", "hashtag", "keyword"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`h-9 px-3 rounded border text-[14px] ${kind === k ? "border-brand text-brand bg-brand-light" : "border-gray-200 text-[#4A5468] hover:border-brand"}`}>
            {k === "all" ? "All" : k === "hashtag" ? "Hashtags" : "Keywords"}
          </button>
        ))}
        {topHashtags.length > 0 && <span className="ml-auto"><CopyButton text={topHashtags.join(" ")} label="Copy top 20 hashtags" /></span>}
      </div>
      {rows.length === 0 ? <div className="text-[14px] text-[#8A92A6] py-6 text-center">No data for this platform yet.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-left text-[#8A92A6]">
                <th className="px-3 py-2 font-normal">Keyword</th>
                <th className="px-3 py-2 font-normal">Used by</th>
                <th className="px-3 py-2 font-normal text-right">Avg {platform === "youtube" ? "views" : "engagement"}</th>
                <th className="px-3 py-2 font-normal">Us</th>
                <th className="px-3 py-2 font-normal w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.keyword} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-[#232D42] font-medium">{r.keyword}<span className="ml-2 text-[12px] font-normal text-[#8A92A6]">{r.kind === "hashtag" ? "hashtag" : "keyword"}</span></td>
                  <td className="px-3 py-2 text-[#4A5468]" title={r.competitors.join(", ")}>{r.accounts} account{r.accounts === 1 ? "" : "s"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#232D42]">{fmt(r.avgEngagement)}</td>
                  <td className="px-3 py-2">
                    {r.oursPosts > 0
                      ? <span className="text-[12px] text-[#2F9E6F]">Used in {r.oursPosts} · avg {fmt(r.oursAvgEngagement)}</span>
                      : <span className="text-[12px] px-2 py-0.5 rounded bg-[#FCF0DA] text-[#B45309]">Not used yet</span>}
                  </td>
                  <td className="px-3 py-2 text-right"><CopyButton text={r.keyword} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── 3. Working for us + gaps ───────────────────────────────────────────────
function OursAndGaps({ data }: { data: Data }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const rows = data[platform];
  const ourAvg = data.oursAvg[platform];
  const best = useMemo(() => rows.filter((r) => r.oursPosts >= 2 && r.oursAvgEngagement != null)
    .sort((a, b) => (b.oursAvgEngagement || 0) - (a.oursAvgEngagement || 0)).slice(0, 8), [rows]);
  const gaps = useMemo(() => rows.filter((r) => r.oursPosts === 0 && r.competitors.length >= 3).slice(0, 12), [rows]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card icon={<IconTrophy size={17} stroke={1.8} />} title="What works for us"
        sub={`Our keywords by how our posts using them perform. Our average: ${fmt(ourAvg)} ${engLabel(platform)}.`}
        right={<PlatformToggle value={platform} onChange={setPlatform} />}>
        {best.length === 0 ? <div className="text-[14px] text-[#8A92A6]">Not enough of our posts share a keyword yet.</div> : (
          <ul className="space-y-2">
            {best.map((r) => {
              const above = ourAvg != null && (r.oursAvgEngagement || 0) > ourAvg;
              return (
                <li key={r.keyword} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0 truncate text-[14px] text-[#232D42]">{r.keyword}</span>
                  <span className="text-[12px] text-[#8A92A6]">{r.oursPosts} posts</span>
                  <span className={`text-[14px] tabular-nums ${above ? "text-[#2F9E6F]" : "text-[#8A92A6]"}`}>{fmt(r.oursAvgEngagement)}</span>
                  <CopyButton text={r.keyword} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card icon={<IconTargetArrow size={17} stroke={1.8} />} title="Gaps to try"
        sub="Used by 3+ competitors, never by us. Worth adding where they fit the post.">
        {gaps.length === 0 ? <div className="text-[14px] text-[#8A92A6]">No gaps right now — we use everything competitors do.</div> : (
          <>
            <div className="flex flex-wrap gap-2">{gaps.map((r) => <Chip key={r.keyword} text={r.keyword} />)}</div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[12px] text-[#8A92A6]">Click a chip to copy one.</span>
              <CopyButton text={gaps.map((r) => r.keyword).join(" ")} label="Copy all" />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── 4. Who we compare with ─────────────────────────────────────────────────
function Competitors({ data, onRefresh }: { data: Data; onRefresh: () => void }) {
  const when = new Date(data.fetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <Card icon={<IconUsers size={17} stroke={1.8} />} title="Accounts we compare with"
      sub={`Doctor-education accounts on Instagram and YouTube, their latest 40 posts each. Updated ${when}; refreshes daily.`}
      right={<button onClick={onRefresh} className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-gray-200 text-[14px] text-[#4A5468] hover:border-brand hover:text-brand"><IconRefresh size={15} stroke={1.8} />Refresh now</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {data.accounts.map((a) => (
          <div key={`${a.platform}:${a.account}`} className="flex items-center gap-3 rounded border border-gray-100 px-3 py-2">
            {a.platform === "instagram" ? <IconBrandInstagram size={18} stroke={1.8} className="text-[#8A92A6] flex-shrink-0" /> : <IconBrandYoutube size={18} stroke={1.8} className="text-[#8A92A6] flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-[#232D42] truncate">{a.name || a.account}</div>
              <div className="text-[12px] text-[#8A92A6] truncate">@{a.account}{a.followers != null ? ` · ${fmt(a.followers)} ${a.platform === "youtube" ? "subscribers" : "followers"}` : ""}</div>
            </div>
            {a.error
              ? <span className="text-[12px] text-rose-600 inline-flex items-center gap-1" title={a.error}><IconAlertTriangle size={14} stroke={1.8} />Couldn&apos;t read</span>
              : <span className="text-[12px] text-[#8A92A6]">{a.analysed} posts</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
