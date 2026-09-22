"use client";
import { useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useApi } from "@/lib/use-api";
import {
  IconSparkles, IconCopy, IconCheck, IconChevronDown, IconExternalLink, IconBrandInstagram, IconBrandYoutube, IconTrendingUp,
  IconTrophy, IconTargetArrow, IconUsers, IconAlertTriangle, IconPlus, IconX, IconTrash, IconChartBar, IconArrowDown,
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
  oursList: { url: string; snippet: string; engagement: number; date?: string }[]; topic: string;
};
type Post = {
  url?: string; image?: string; caption: string; date?: string; engagement: number; keywords: string[];
  likes?: number; comments?: number; views?: number; reach?: number; saves?: number; shares?: number;
};
type Account = { platform: Platform; account: string; name?: string; followers?: number; analysed: number; error?: string; pic?: string; posts?: Post[]; custom?: boolean; stale?: string };
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
  const [kwPlatform, setKwPlatform] = useState<Platform>("instagram"); // one switch for topics + what works + gaps
  const [tab, setTab] = useState<"keywords" | "ranking">("keywords");
  return (
    <div className="preview-scope space-y-4">
      <div className="inline-flex bg-white border border-gray-100 rounded-xl p-1 gap-1">
        {([["keywords", "Keywords", <IconSparkles key="k" size={16} stroke={1.8} />], ["ranking", "Ranking", <IconChartBar key="r" size={16} stroke={1.8} />]] as const).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`h-9 px-4 rounded-lg text-[14px] font-medium inline-flex items-center gap-1.5 ${tab === k ? "bg-brand-light text-brand" : "text-[#8A92A6] hover:text-[#232D42]"}`}>{icon}{label}</button>
        ))}
      </div>
      {tab === "keywords" && <Generator />}
      {error ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-[14px] text-rose-600">Couldn&apos;t load keyword data: {error.message}</div>
      ) : !data ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6"><LoadingBlock label={isLoading ? "Reading our posts and 9 competitors' — this takes a moment the first time…" : undefined} /></div>
      ) : tab === "ranking" ? <Ranking data={data} /> : (
        <>
          <Competitors data={data} onRefresh={() => setKey(`/api/seo/social?fresh=1&t=${Date.now()}`)} />
          {/* Topics on the left; what works for us + gaps beside them, so nothing sits far below. */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
            <Trending data={data} platform={kwPlatform} setPlatform={setKwPlatform} />
            <OursAndGaps data={data} platform={kwPlatform} />
          </div>
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

// ── 2. Doctor keywords by topic ────────────────────────────────────────────
// Grouped so a whole topic can be copied in one go; tap chips to build your own set.
// Hashtags copy space-separated (ready for a caption), keywords comma-separated.
const joinForPost = (ks: string[]) => {
  const tags = ks.filter((k) => k.startsWith("#")), words = ks.filter((k) => !k.startsWith("#"));
  return [words.join(", "), tags.join(" ")].filter(Boolean).join("\n\n");
};
const TOPIC_ORDER = ["NEET PG & INI-CET", "FMGE & NExT", "UK — PLAB, GMC, NHS", "Australia — AMC, AHPRA", "USA — USMLE", "Gulf — DHA, HAAD, Prometric", "English tests — OET, IELTS", "Working abroad", "General medical"];

function Trending({ data, platform, setPlatform }: { data: Data; platform: Platform; setPlatform: (p: Platform) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]); // groups showing all keywords, not just the top 8
  const tracked = data.accounts.filter((a) => a.platform === platform && a.analysed > 0).length;
  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of data[platform]) g.set(r.topic, [...(g.get(r.topic) || []), r]);
    return TOPIC_ORDER.filter((t) => g.has(t)).map((t) => ({ topic: t, rows: g.get(t)!.slice(0, 20) }));
  }, [data, platform]);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <Card icon={<IconTrendingUp size={17} stroke={1.8} />} title="Keywords by topic"
      sub={`What the ${tracked} accounts we track use, grouped by topic — best first (more accounts using it, better-performing posts). Copy a whole group, or tap keywords to build your own set.`}
      right={<PlatformToggle value={platform} onChange={(p) => { setPlatform(p); setPicked([]); setOpen(null); setExpanded([]); }} />}>
      {/* Selection bar — stays visible while picking across groups */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-[14px] text-[#232D42]">{picked.length ? <><b className="font-medium">{picked.length}</b> selected</> : <span className="text-[#8A92A6]">Tap keywords below to select them</span>}</span>
        {picked.length > 0 && <button onClick={() => setPicked([])} className="text-[12px] text-[#8A92A6] hover:text-[#232D42]">Clear</button>}
        <span className="ml-auto">{picked.length > 0 && <CopyButton text={joinForPost(picked)} label={`Copy selected (${picked.length})`} />}</span>
      </div>
      <div className="space-y-4">
        {groups.map(({ topic, rows }) => (
          <div key={topic} className="rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 px-3 py-2 bg-[#F6F7FB] border-b border-gray-100 rounded-t-lg">
              <span className="text-[14px] font-medium text-[#232D42]">{topic}</span>
              <span className="text-[12px] text-[#8A92A6]">{rows.length}</span>
              <button onClick={() => setOpen(open === topic ? null : topic)} className="ml-auto text-[12px] text-brand inline-flex items-center gap-1 hover:underline">
                {open === topic ? "Hide details" : "Show details"}<IconChevronDown size={14} className={open === topic ? "rotate-180" : ""} />
              </button>
              <CopyButton text={joinForPost(rows.map((r) => r.keyword))} label="Copy all" />
            </div>
            <div className="p-3 flex flex-wrap gap-2">
              {(expanded.includes(topic) || open === topic ? rows : rows.slice(0, 8)).map((r) => {
                const on = picked.includes(r.keyword);
                return (
                  <button key={r.keyword} onClick={() => toggle(r.keyword)}
                    title={`${r.accounts} account${r.accounts === 1 ? "" : "s"} · avg ${fmt(r.avgEngagement)} ${engLabel(platform)}${r.oursPosts ? ` · we used it in ${r.oursPosts}` : " · we haven't used it"}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[14px] transition ${on ? "border-brand bg-brand-light text-brand" : "border-gray-200 bg-white text-[#232D42] hover:border-brand"}`}>
                    {on && <IconCheck size={13} stroke={2.2} />}{r.keyword}
                    {!r.oursPosts && <span className="w-1.5 h-1.5 rounded-full bg-[#E0791F]" title="We haven't used this yet" />}
                  </button>
                );
              })}
              {rows.length > 8 && open !== topic && (
                <button onClick={() => setExpanded((e) => (e.includes(topic) ? e.filter((t) => t !== topic) : [...e, topic]))}
                  className="px-2.5 py-1 rounded text-[13px] text-brand hover:underline">
                  {expanded.includes(topic) ? "Show less" : `Show all ${rows.length}`}
                </button>
              )}
            </div>
            {open === topic && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-[#8A92A6]">
                      <th className="px-3 py-2 font-normal">Keyword</th>
                      <th className="px-3 py-2 font-normal">Which accounts use it</th>
                      <th className="px-3 py-2 font-normal text-right">Avg {platform === "youtube" ? "views" : "engagement"}</th>
                      <th className="px-3 py-2 font-normal">Our posts using it <span className="text-[12px]">(hover for the caption, click to open)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.keyword} className="border-t border-gray-50 align-top">
                        <td className="px-3 py-2 text-[#232D42] font-medium whitespace-nowrap">{r.keyword}</td>
                        <td className="px-3 py-2">
                          {r.competitors.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {r.competitors.map((c) => (
                                <a key={c} href={platform === "youtube" ? `https://www.youtube.com/@${c}` : `https://www.instagram.com/${c}/`} target="_blank" rel="noreferrer"
                                  className="px-2 py-0.5 rounded-full bg-[#F6F7FB] border border-gray-100 text-[12px] text-[#4A5468] hover:border-brand hover:text-brand">@{c}</a>
                              ))}
                            </div>
                          ) : <span className="text-[12px] text-[#8A92A6]">Only us</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.avgEngagement)}</td>
                        <td className="px-3 py-2">
                          {r.oursList.length === 0 ? <span className="text-[12px] px-2 py-0.5 rounded bg-[#FCF0DA] text-[#B45309]">Not used yet</span> : (
                            // One button per post: date + engagement, opens the post; the
                            // caption's opening line is the tooltip, not row clutter.
                            <div className="flex flex-wrap gap-1.5">
                              {r.oursList.slice(0, 4).map((p) => (
                                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={`${p.snippet}…`}
                                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-gray-200 bg-white text-[12px] text-[#232D42] hover:border-brand hover:text-brand">
                                  {p.date ? new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Post"}
                                  <span className="text-[#8A92A6]">· {fmt(p.engagement)} {platform === "youtube" ? "views" : "eng."}</span>
                                  <IconExternalLink size={12} stroke={1.8} className="text-[#8A92A6]" />
                                </a>
                              ))}
                              {r.oursPosts > 4 && <span className="inline-flex items-center h-7 px-2.5 rounded bg-[#F6F7FB] text-[12px] text-[#8A92A6]">+{r.oursPosts - 4} more</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[12px] text-[#8A92A6] mt-3 inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#E0791F]" />= we haven&apos;t used it yet. Hover a keyword for its numbers.</div>
    </Card>
  );
}

// ── 3. Working for us + gaps ───────────────────────────────────────────────
function OursAndGaps({ data, platform }: { data: Data; platform: Platform }) {
  const rows = data[platform];
  const ourAvg = data.oursAvg[platform];
  const best = useMemo(() => rows.filter((r) => r.oursPosts >= 2 && r.oursAvgEngagement != null)
    .sort((a, b) => (b.oursAvgEngagement || 0) - (a.oursAvgEngagement || 0)).slice(0, 8), [rows]);
  const gaps = useMemo(() => rows.filter((r) => r.oursPosts === 0 && r.competitors.length >= 3).slice(0, 12), [rows]);
  return (
    <div className="flex flex-col gap-4">
      <Card icon={<IconTrophy size={17} stroke={1.8} />} title="What works for us"
        sub={`${platform === "youtube" ? "YouTube" : "Instagram"}: our keywords by how our posts using them perform. Our average: ${fmt(ourAvg)} ${engLabel(platform)}.`}>
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
// Left: the accounts. Right: the picked one's profile, every keyword it used (copy
// one or all; click to show only the posts using it) and its posts in a grid.
// Instagram caps how often other accounts can be read per hour; say so plainly.
const limitHit = (m?: string) => !!m && /request limit|\(#4\)/i.test(m);
const readError = (m: string) => (limitHit(m) ? "Instagram's hourly limit for reading other accounts is used up. It resets within an hour — press Refresh now then." : m);
const handleOf = (a: Account) => a.account.replace(/^@/, "");
const profileUrl = (a: Account) => (a.platform === "youtube" ? `https://www.youtube.com/@${handleOf(a)}` : `https://www.instagram.com/${handleOf(a)}/`);
const PlatformIcon = ({ p, size = 18 }: { p: Platform; size?: number }) =>
  p === "instagram" ? <IconBrandInstagram size={size} stroke={1.8} className="text-[#8A92A6] flex-shrink-0" /> : <IconBrandYoutube size={size} stroke={1.8} className="text-[#8A92A6] flex-shrink-0" />;

function Competitors({ data, onRefresh }: { data: Data; onRefresh: () => void }) {
  const when = new Date(data.fetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const [platform, setPlatform] = useState<Platform>("instagram");
  const list = data.accounts.filter((a) => a.platform === platform);
  const isOurs = (a: Account) => handleOf(a).toLowerCase() === "goocampus";
  const ourAcc = list.find(isOurs), others = list.filter((a) => !isOurs(a));
  const ourKws = useMemo(() => new Set((ourAcc?.posts || []).flatMap((p) => p.keywords.map((k) => k.toLowerCase()))), [ourAcc]);
  const [sel, setSel] = useState("");
  const picked = list.find((a) => `${a.platform}:${a.account}` === sel) || list[0];
  const remove = async (a: Account) => {
    if (!confirm(`Stop tracking @${handleOf(a)}?`)) return;
    const r = await fetch("/api/seo/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: a.platform, handle: a.account }) });
    if (r.ok) onRefresh(); else alert(((await r.json().catch(() => ({}))) as { error?: string }).error || "Couldn't remove it.");
  };
  return (
    <Card icon={<IconUsers size={17} stroke={1.8} />} title="Accounts we compare with"
      sub={`Our account and the doctor-education accounts we compare with — latest 40 posts each. Click one to see its keywords and posts. Updated ${when}; refreshes by itself daily.`}
      right={<PlatformToggle value={platform} onChange={(p) => { setPlatform(p); setSel(""); }} />}>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        <div className="flex flex-col gap-1.5 lg:max-h-[860px] lg:overflow-y-auto lg:pr-1">
          <div className="text-[12px] font-medium text-[#8A92A6] uppercase tracking-wide px-1">Our account</div>
          {[ourAcc, "divider" as const, ...others].map((a) => {
            if (a === "divider") return (
              <div key="divider" className="flex flex-col gap-1.5 mt-3">
                <div className="text-[12px] font-medium text-[#8A92A6] uppercase tracking-wide px-1">Compared with ({others.length})</div>
                <AddAccount platform={platform} onAdded={onRefresh} />
              </div>
            );
            if (!a) return null;
            const key = `${a.platform}:${a.account}`, on = picked && key === `${picked.platform}:${picked.account}`;
            const ours = isOurs(a);
            return (
              <div key={key} role="button" tabIndex={0} onClick={() => setSel(key)} onKeyDown={(e) => { if (e.key === "Enter") setSel(key); }}
                className={`group flex items-center gap-3 rounded border px-3 py-2 text-left transition cursor-pointer ${on ? "border-brand bg-brand-light" : "border-gray-100 hover:border-gray-300"}`}>
                {a.pic ? <img src={a.pic} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover bg-[#F6F7FB] flex-shrink-0" /> : <span className="w-8 h-8 rounded-full bg-[#F6F7FB] grid place-items-center flex-shrink-0"><PlatformIcon p={a.platform} size={16} /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[14px] text-[#232D42] truncate">{a.name || handleOf(a)}</span>
                    {ours && <span className="px-1.5 py-px rounded bg-brand text-white text-[11px] flex-shrink-0">Us</span>}
                    {a.custom && <span className="px-1.5 py-px rounded bg-[#F6F7FB] border border-gray-200 text-[#8A92A6] text-[11px] flex-shrink-0">Added</span>}
                  </div>
                  <div className="text-[12px] text-[#8A92A6] truncate">{a.followers != null ? `${fmt(a.followers)} ${a.platform === "youtube" ? "subs" : "followers"} · ` : ""}{a.analysed} posts</div>
                </div>
                {a.error
                  ? <span className="text-[12px] text-rose-600 inline-flex items-center gap-1" title={a.error}><IconAlertTriangle size={14} stroke={1.8} />{limitHit(a.error) ? "Try later" : "Couldn\u2019t read"}</span>
                  : null}
                {!ours && (
                  <button title="Stop tracking this account" onClick={(e) => { e.stopPropagation(); remove(a); }}
                    className="w-6 h-6 -mr-1 grid place-items-center rounded text-[#8A92A6] hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"><IconX size={14} stroke={2} /></button>
                )}
              </div>
            );
          })}
        </div>
        {picked && <AccountDetail key={`${picked.platform}:${picked.account}`} a={picked} ours={isOurs(picked)} ourKws={ourKws}
          onRemove={isOurs(picked) ? undefined : () => remove(picked)} />}
      </div>
    </Card>
  );
}

// "+ Add account": checks the handle can be read, saves it, then the data refreshes.
function AddAccount({ platform, onAdded }: { platform: Platform; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!handle.trim()) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/seo/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Couldn't add it."); return; }
    setHandle(""); setOpen(false); onAdded();
  };
  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-1.5 h-10 rounded border border-dashed border-gray-300 text-[14px] text-[#4A5468] hover:border-brand hover:text-brand">
      <IconPlus size={15} stroke={2} />Add {platform === "youtube" ? "YouTube channel" : "Instagram account"}
    </button>
  );
  return (
    <div className="rounded border border-brand p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <PlatformIcon p={platform} size={16} />
        <input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
          placeholder={platform === "youtube" ? "@channelhandle" : "@username"} className="flex-1 min-w-0 h-9 px-2.5 rounded border border-gray-200 text-[14px] outline-none focus:border-brand" />
      </div>
      {err && <div className="text-[12px] text-rose-600">{err}</div>}
      {platform === "instagram" && !err && <div className="text-[12px] text-[#8A92A6]">Business or creator accounts only — Instagram doesn&apos;t share personal ones.</div>}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={() => { setOpen(false); setErr(""); }} className="h-8 px-3 rounded text-[13px] text-[#8A92A6] hover:text-[#232D42]">Cancel</button>
        <button onClick={submit} disabled={busy || !handle.trim()} className="h-8 px-3 rounded bg-brand text-white text-[13px] disabled:opacity-50">{busy ? "Checking…" : "Add"}</button>
      </div>
    </div>
  );
}

// For a competitor, keywords we've never used are marked, so it reads as a comparison.
function AccountDetail({ a, ours, ourKws, onRemove }: { a: Account; ours: boolean; ourKws: Set<string>; onRemove?: () => void }) {
  const posts = useMemo(() => a.posts || [], [a]);
  const [only, setOnly] = useState<string | null>(null);
  const [showPosts, setShowPosts] = useState(true);
  // Every keyword this account used, most-used first.
  const kws = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) for (const k of p.keywords) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [posts]);
  const notOurs = ours ? [] : kws.filter(([k]) => !ourKws.has(k.toLowerCase())).map(([k]) => k);
  const shown = only ? posts.filter((p) => p.keywords.includes(only)) : posts;
  const unit = a.platform === "youtube" ? "views" : "eng.";
  return (
    <div className="min-w-0 flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl bg-brand-light px-4 py-3">
        {a.pic ? <img src={a.pic} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover bg-white flex-shrink-0" /> : <span className="w-12 h-12 rounded-full bg-white grid place-items-center flex-shrink-0"><PlatformIcon p={a.platform} size={22} /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-[#232D42] truncate">{a.name || handleOf(a)}</div>
          <div className="text-[13px] text-[#4A5468] truncate">
            @{handleOf(a)} · {a.platform === "youtube" ? "YouTube" : "Instagram"}
            {a.followers != null ? ` · ${fmt(a.followers)} ${a.platform === "youtube" ? "subscribers" : "followers"}` : ""} · {posts.length} {a.platform === "youtube" ? "videos" : "posts"} read
          </div>
        </div>
        <a href={profileUrl(a)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-gray-200 bg-white text-[14px] text-[#4A5468] hover:border-brand hover:text-brand flex-shrink-0">
          Open profile<IconExternalLink size={14} stroke={1.8} />
        </a>
        {onRemove && (
          <button onClick={onRemove} className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-gray-200 bg-white text-[14px] text-[#4A5468] hover:border-rose-300 hover:text-rose-600 flex-shrink-0">
            <IconTrash size={14} stroke={1.8} />Remove
          </button>
        )}
      </div>

      {a.stale && <div className="text-[12px] text-[#B45309] bg-[#FCF0DA] rounded px-3 py-1.5">Couldn&apos;t refresh just now — showing the last read. {limitHit(a.stale) ? "Instagram's hourly limit is used up; it resets within an hour." : a.stale}</div>}
      {a.error ? <div className="text-[14px] text-[#B45309] bg-[#FCF0DA] rounded px-3 py-2">Couldn&apos;t read this account. {readError(a.error)}</div> : (
        <>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-[14px] font-medium text-[#232D42]">Keywords used <span className="text-[#8A92A6] font-normal">({kws.length})</span></div>
              <span className="text-[12px] text-[#8A92A6]">Click one to show only its posts · the number is how many posts use it
                {!ours && <> · <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#E0791F] align-middle" /> = we don&apos;t use it</>}</span>
              <span className="ml-auto flex items-center gap-2">
                {notOurs.length > 0 && <CopyButton text={joinForPost(notOurs)} label={`Copy ones we don't use (${notOurs.length})`} />}
                {kws.length > 0 && <CopyButton text={joinForPost(kws.map(([k]) => k))} label="Copy all" />}
              </span>
            </div>
            {kws.length === 0 ? <div className="text-[14px] text-[#8A92A6]">No hashtags or doctor keywords in these posts.</div> : (
              <div className="flex flex-wrap gap-1.5 max-h-[168px] overflow-y-auto">
                {kws.map(([k, n]) => (
                  <span key={k} className={`inline-flex items-center rounded border text-[13px] ${only === k ? "border-brand bg-brand-light" : "border-gray-200 bg-white"}`}>
                    <button onClick={() => setOnly(only === k ? null : k)} className="pl-2.5 pr-1.5 py-1 text-[#232D42] hover:text-brand">
                      {k} <span className="text-[#8A92A6]">{n}</span>
                      {!ours && !ourKws.has(k.toLowerCase()) && <span className="inline-block ml-1 w-1.5 h-1.5 rounded-full bg-[#E0791F] align-middle" title="We don't use this" />}
                    </button>
                    <MiniCopy text={k} />
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2 text-[14px] font-medium text-[#232D42]">
              <button onClick={() => setShowPosts((v) => !v)} title={showPosts ? "Hide posts" : "Show posts"}
                className="w-6 h-6 -ml-1 grid place-items-center rounded text-[#8A92A6] hover:text-brand hover:bg-brand-light">
                <IconChevronDown size={16} stroke={2} className={`transition ${showPosts ? "" : "-rotate-90"}`} />
              </button>
              {only ? <>Posts using <span className="text-brand">{only}</span> <span className="text-[#8A92A6] font-normal">({shown.length})</span>
                <button onClick={() => setOnly(null)} className="ml-1 text-[12px] font-normal text-[#8A92A6] hover:text-brand underline">show all</button></>
                : <>All posts <span className="text-[#8A92A6] font-normal">({posts.length})</span></>}
            </div>
            {showPosts && <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {shown.map((p, i) => (
                <a key={p.url || i} href={p.url} target="_blank" rel="noreferrer"
                  className="group relative aspect-square rounded-lg overflow-hidden border border-gray-100 bg-[#F6F7FB]">
                  {p.image
                    ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 p-2.5 text-[12px] leading-snug text-[#4A5468] overflow-hidden">{p.caption || "No caption"}</div>}
                  {/* Hover: caption + keywords found in it. */}
                  <div className="absolute inset-0 bg-[#232D42]/90 text-white p-2.5 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition overflow-hidden">
                    <div className="text-[12px] leading-snug line-clamp-4">{p.caption || "No caption"}</div>
                    {p.keywords.length > 0 && <div className="text-[11px] leading-snug text-[#C9D2FF] line-clamp-4">{p.keywords.join(" ")}</div>}
                  </div>
                  <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] flex items-center gap-1 group-hover:opacity-0 transition">
                    {p.date && <span>{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                    <span className="ml-auto">{fmt(p.engagement)} {unit}</span>
                  </div>
                </a>
              ))}
            </div>}
          </div>
        </>
      )}
    </div>
  );
}

// Small copy icon beside a keyword.
function MiniCopy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button title="Copy" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1200); } }}
      className="pr-2 pl-1 py-1 border-l border-gray-100 text-[#8A92A6] hover:text-brand">
      {done ? <IconCheck size={13} stroke={2} className="text-[#2F9E6F]" /> : <IconCopy size={13} stroke={1.8} />}
    </button>
  );
}

// ── Ranking tab ────────────────────────────────────────────────────────────
// 1. Our keywords ranked by what our posts using them got (reach, views, saves…).
// 2. Keywords across every account, by engagement per 1,000 followers so big
//    accounts don't win just by being big. Other accounts only share likes +
//    comments (Instagram) or views (YouTube), so that's all section 2 can use.
type Col<T> = { key: keyof T & string; label: string; rate?: boolean };
const avgOf = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

function SortTable<T extends { keyword: string }>({ rows, cols, initial, baseline, extra }: {
  rows: T[]; cols: Col<T>[]; initial: keyof T & string; baseline?: Partial<T>; extra?: (r: T) => React.ReactNode;
}) {
  const [sort, setSort] = useState<keyof T & string>(initial);
  const sorted = [...rows].sort((a, b) => ((b[sort] as number | null) ?? -1) - ((a[sort] as number | null) ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead className="bg-gray-50">
          <tr className="text-left text-[#8A92A6]">
            <th className="px-3 py-2 font-normal w-8">#</th>
            <th className="px-3 py-2 font-normal">Keyword</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 font-normal text-right whitespace-nowrap">
                <button onClick={() => setSort(c.key)} className={`inline-flex items-center gap-1 hover:text-brand ${sort === c.key ? "text-brand font-medium" : ""}`}>
                  {c.label}{sort === c.key && <IconArrowDown size={13} stroke={2} />}
                </button>
              </th>
            ))}
            {extra && <th className="px-3 py-2 font-normal" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.keyword} className="border-t border-gray-50">
              <td className="px-3 py-2 text-[#8A92A6] tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 text-[#232D42] font-medium whitespace-nowrap">
                <span className="inline-flex items-center rounded border border-gray-200 bg-white"><span className="pl-2 pr-1 py-0.5">{r.keyword}</span><MiniCopy text={r.keyword} /></span>
              </td>
              {cols.map((c) => {
                const v = r[c.key] as number | null, b = baseline?.[c.key] as number | null | undefined;
                const tone = b == null || v == null || c.key === "posts" || c.key === "accounts" ? "text-[#232D42]" : v > b ? "text-[#2F9E6F]" : "text-[#8A92A6]";
                return <td key={c.key} className={`px-3 py-2 text-right tabular-nums ${sort === c.key ? "font-medium" : ""} ${tone}`}>{c.rate ? pct(v) : fmt(v == null ? null : Math.round(v))}</td>;
              })}
              {extra && <td className="px-3 py-2">{extra(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type OurRow = { keyword: string; posts: number; reach: number | null; views: number | null; engagement: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; rate: number | null };
type AllRow = { keyword: string; per1k: number | null; accounts: number; posts: number; oursPosts: number };

function Ranking({ data }: { data: Data }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [showOnes, setShowOnes] = useState(false);
  const yt = platform === "youtube";
  const accs = data.accounts.filter((a) => a.platform === platform && (a.posts || []).length);
  const ours = accs.find((a) => handleOf(a).toLowerCase() === "goocampus");

  // 1. Our keywords.
  const { ourRows, ourBase } = useMemo(() => {
    const posts = ours?.posts || [];
    const eng = (p: Post) => (p.likes ?? 0) + (p.comments ?? 0) + (yt ? 0 : (p.saves ?? 0) + (p.shares ?? 0));
    // Engagement rate: interactions ÷ reach (Instagram) or ÷ views (YouTube).
    const rateOf = (ps: Post[]) => {
      const den = ps.reduce((s, p) => s + ((yt ? p.views : p.reach) ?? 0), 0);
      return den ? (ps.reduce((s, p) => s + eng(p), 0) / den) * 100 : null;
    };
    const row = (keyword: string, ps: Post[]): OurRow => ({
      keyword, posts: ps.length, reach: avgOf(ps.map((p) => p.reach)), views: avgOf(ps.map((p) => p.views)),
      engagement: avgOf(ps.map((p) => (p.likes ?? 0) + (p.comments ?? 0))), likes: avgOf(ps.map((p) => p.likes)), comments: avgOf(ps.map((p) => p.comments)),
      saves: avgOf(ps.map((p) => p.saves)), shares: avgOf(ps.map((p) => p.shares)), rate: rateOf(ps),
    });
    const by = new Map<string, Post[]>();
    for (const p of posts) for (const k of p.keywords) by.set(k, [...(by.get(k) || []), p]);
    return { ourRows: [...by.entries()].map(([k, ps]) => row(k, ps)), ourBase: row("all", posts) };
  }, [ours, yt]);

  // 2. Across every account, per 1,000 followers.
  const allRows = useMemo(() => {
    const by = new Map<string, { vals: number[]; accounts: Set<string>; ours: number }>();
    for (const a of accs) {
      if (!a.followers) continue;
      const us = handleOf(a).toLowerCase() === "goocampus";
      for (const p of a.posts || []) {
        const v = (p.engagement / a.followers) * 1000;
        for (const k of p.keywords) {
          const e = by.get(k) || { vals: [], accounts: new Set<string>(), ours: 0 };
          e.vals.push(v); e.accounts.add(a.account); if (us) e.ours += 1;
          by.set(k, e);
        }
      }
    }
    return [...by.entries()].map(([keyword, e]): AllRow => ({ keyword, per1k: avgOf(e.vals), accounts: e.accounts.size, posts: e.vals.length, oursPosts: e.ours }));
  }, [accs]);

  const ourShown = ourRows.filter((r) => showOnes || r.posts >= 2);
  const allShown = allRows.filter((r) => showOnes || (r.posts >= 3 && r.accounts >= 2));
  const topOurs = [...ourShown].sort((a, b) => ((yt ? b.views : b.reach) ?? 0) - ((yt ? a.views : a.reach) ?? 0)).slice(0, 10).map((r) => r.keyword);
  const topAll = [...allShown].sort((a, b) => (b.per1k ?? 0) - (a.per1k ?? 0)).slice(0, 10).map((r) => r.keyword);

  const ourCols: Col<OurRow>[] = yt
    ? [{ key: "posts", label: "Videos" }, { key: "views", label: "Avg views" }, { key: "likes", label: "Avg likes" }, { key: "comments", label: "Avg comments" }, { key: "rate", label: "Eng. rate", rate: true }]
    : [{ key: "posts", label: "Posts" }, { key: "reach", label: "Avg reach" }, { key: "views", label: "Avg views" }, { key: "engagement", label: "Avg likes + comments" }, { key: "saves", label: "Avg saves" }, { key: "shares", label: "Avg shares" }, { key: "rate", label: "Eng. rate", rate: true }];
  const unused = (r: AllRow) => (r.oursPosts ? <span className="text-[12px] text-[#8A92A6]">We use it ({r.oursPosts})</span> : <span className="text-[12px] px-2 py-0.5 rounded bg-[#FCF0DA] text-[#B45309] whitespace-nowrap">Not used yet</span>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <PlatformToggle value={platform} onChange={setPlatform} />
        <label className="inline-flex items-center gap-2 text-[14px] text-[#4A5468] cursor-pointer">
          <input type="checkbox" checked={showOnes} onChange={(e) => setShowOnes(e.target.checked)} className="accent-[#3A57E8]" />
          Include keywords from just one post {showOnes ? "" : "(hidden — one post proves little)"}
        </label>
      </div>

      <Card icon={<IconTrophy size={17} stroke={1.8} />} title="Our keywords, ranked"
        sub={`Average per ${yt ? "video" : "post"} for our ${yt ? "YouTube videos" : "Instagram posts"} using each keyword (last ${ours?.posts?.length ?? 0}). Green = beats our average ${yt ? "video" : "post"}. Click a column to sort. Eng. rate = ${yt ? "likes + comments ÷ views" : "likes, comments, saves and shares ÷ reach"}.`}
        right={topOurs.length > 0 && <CopyButton text={joinForPost(topOurs)} label={`Copy top ${topOurs.length}`} />}>
        {ourShown.length === 0 ? <div className="text-[14px] text-[#8A92A6]">{ours ? "No keyword appears in two or more of our posts yet." : "Couldn't read our account."}</div> : (
          <>
            <div className="text-[12px] text-[#8A92A6] mb-2">
              Our average {yt ? "video" : "post"}: {yt ? `${fmt(ourBase.views == null ? null : Math.round(ourBase.views))} views` : `${fmt(ourBase.reach == null ? null : Math.round(ourBase.reach))} reach · ${fmt(ourBase.views == null ? null : Math.round(ourBase.views))} views · ${fmt(ourBase.saves == null ? null : Math.round(ourBase.saves))} saves`} · {pct(ourBase.rate)} eng. rate
            </div>
            {(() => {
              const total = ours?.posts?.length || 0, same = ourShown.filter((r) => total && r.posts >= total * 0.8).map((r) => r.keyword);
              return same.length > 0 && (
                <div className="text-[12px] text-[#B45309] bg-[#FCF0DA] rounded px-3 py-1.5 mb-2">
                  {same.join(", ")} {same.length === 1 ? "is" : "are"} on almost every one of our {yt ? "videos" : "posts"} (usually boilerplate tags), so {same.length === 1 ? "its" : "their"} numbers are just our average. Use tags that match each {yt ? "video" : "post"} to see what really works.
                </div>
              );
            })()}
            <SortTable key={`ours-${platform}`} rows={ourShown} cols={ourCols} initial={yt ? "views" : "reach"} baseline={ourBase} />
          </>
        )}
      </Card>

      <Card icon={<IconTrendingUp size={17} stroke={1.8} />} title="Across all accounts"
        sub={`How each keyword does on every account we track, as ${yt ? "views" : "likes + comments"} per 1,000 ${yt ? "subscribers" : "followers"} — so a big account doesn't win just by being big. ${showOnes ? "" : "Showing keywords used in 3+ posts by 2+ accounts. "}Other accounts don't share reach, so this is the fairest comparison possible.`}
        right={topAll.length > 0 && <CopyButton text={joinForPost(topAll)} label={`Copy top ${topAll.length}`} />}>
        {allShown.length === 0 ? <div className="text-[14px] text-[#8A92A6]">Not enough shared keywords yet{accs.length < 3 ? " — some accounts couldn't be read right now" : ""}.</div> : (
          <SortTable key={`all-${platform}`} rows={allShown} initial="per1k" extra={unused}
            cols={[{ key: "per1k", label: `Avg per 1K ${yt ? "subs" : "followers"}` }, { key: "accounts", label: "Accounts" }, { key: "posts", label: yt ? "Videos" : "Posts" }]} />
        )}
      </Card>
    </div>
  );
}
