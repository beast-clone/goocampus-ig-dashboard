"use client";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type PublishTo = "Facebook" | "Instagram" | "Instagram/Facebook";
type PublishToPage = "GooCampus Main" | "GooCampus World" | "12Plus / GC India";

type ScheduledPost = {
  id: string;
  particulars: string;
  publishToPage: string;
  caption: string;
  scheduleTime: string | null;
  status: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  publishedAt: string | null;
};

type TimeSuggestion = {
  weekday: number; hour: number; weekdayLabel: string; hourLabel: string;
  followersOnline: number; nextOccurrenceISO: string;
};

type Prediction = {
  basis: "topic-keyword" | "hashtag-overlap" | "recent-avg" | "no-data";
  matchedPosts: number;
  avgReach: number;
  avgEngagement: number;
  avgLikes: number;
  sampleSize: number;
  hashtagsMatched: string[];
  keywordsMatched: string[];
  note: string;
  hashtagLift: {
    withAvgReach: number;
    withoutAvgReach: number;
    liftPct: number;
    sampleWith: number;
    sampleWithout: number;
  } | null;
  suggestedHashtags: string[];
  captionHasHashtags: boolean;
};

type TopPerformer = {
  id: string; permalink: string; thumbnail: string | null; mediaType: string;
  caption: string; reach: number; likes: number; comments: number; timestamp: string;
};

const PAGE_OPTIONS: { value: PublishToPage; label: string; subtitle: string }[] = [
  { value: "GooCampus Main",     label: "GooCampus Main",       subtitle: "@goocampus + 2 FB pages" },
  { value: "GooCampus World",    label: "GooCampus World",      subtitle: "@goocampusworld + GooCampus World page" },
  { value: "12Plus / GC India",  label: "GooCampus India",      subtitle: "@12thplusdotcom + GC India page" },
];

const PUBLISH_TO_OPTIONS: { value: PublishTo; label: string; icon: string }[] = [
  { value: "Instagram/Facebook", label: "Instagram + Facebook", icon: "📱" },
  { value: "Instagram",          label: "Instagram only",       icon: "📸" },
  { value: "Facebook",           label: "Facebook only",        icon: "👍" },
];

export default function SchedulerPage() {
  return (
    <DashboardShell title="Scheduler" subtitle="Create post → drops into your Content Calendar → n8n picks it up within a minute.">
      {() => <Scheduler />}
    </DashboardShell>
  );
}

function Scheduler() {
  // Form state
  const [particulars, setParticulars] = useState("");
  const [publishToPage, setPublishToPage] = useState<PublishToPage>("GooCampus Main");
  const [publishTo, setPublishTo] = useState<PublishTo>("Instagram/Facebook");
  const [caption, setCaption] = useState("");
  // Content brief — the topic the post is about. Feeds the AI caption suggester
  // so the model can write ON topic instead of averaging tone from mixed past posts.
  const [contentBrief, setContentBrief] = useState("");
  // Suggestion state — 3 variants from OpenAI, only fetched on button click.
  type SuggestVariant = { kind: "tone" | "seo" | "punchy"; caption: string; hashtags: string[]; prediction: Prediction | null };
  const [suggestions, setSuggestions] = useState<SuggestVariant[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([""]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: true; recordId: string } | { ok: false; error: string } | null>(null);

  // Smart features state
  const [timeSuggestions, setTimeSuggestions] = useState<TimeSuggestion[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topLoading, setTopLoading] = useState(false);

  // Queue
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFetchedAt, setQueueFetchedAt] = useState<number | null>(null);
  const [queueLatency, setQueueLatency] = useState<number | null>(null);

  const loadQueue = () => {
    setQueueLoading(true);
    const t0 = Date.now();
    fetch("/api/scheduler/queue")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { posts?: ScheduledPost[] }) => {
        setQueue(d.posts || []);
        setQueueFetchedAt(Date.now());
        setQueueLatency(Date.now() - t0);
      })
      .catch(() => {})
      .finally(() => setQueueLoading(false));
  };

  useEffect(() => { loadQueue(); }, []);

  // Smart time suggestions — refetch when brand changes
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/scheduler/suggest-time?publishToPage=${encodeURIComponent(publishToPage)}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { suggestions?: TimeSuggestion[] } | null) => { if (d?.suggestions) setTimeSuggestions(d.suggestions); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [publishToPage]);

  // Prediction — refetch when brand or caption changes (debounced).
  // CRITICAL: clear old prediction state IMMEDIATELY on every change so stale data
  // never lingers between captions; loading state takes over until new fetch completes.
  useEffect(() => {
    // Always wipe stale prediction first — applies to both "empty caption" and "new caption" cases
    setPrediction(null);

    const trimmed = caption.trim();
    if (!trimmed) {
      // No caption → no prediction, no loading either
      setPredictionLoading(false);
      return;
    }

    // Show loading immediately so user sees feedback while we wait for the debounce
    setPredictionLoading(true);

    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/scheduler/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishToPage, caption: trimmed }),
        signal: ctrl.signal,
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { prediction?: Prediction } | null) => { if (d?.prediction) setPrediction(d.prediction); })
        .catch(() => {})  // abort errors are expected when the next keystroke supersedes
        .finally(() => setPredictionLoading(false));
    }, 800);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [publishToPage, caption]);

  function applyTimeSuggestion(s: TimeSuggestion) {
    const d = new Date(s.nextOccurrenceISO);
    const ymd = d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setScheduleEnabled(true);
    setScheduleDate(ymd);
    setScheduleTime(hm);
  }

  async function openTopPerformers() {
    setTopModalOpen(true);
    if (topPerformers.length > 0) return;
    setTopLoading(true);
    try {
      const r = await fetch(`/api/scheduler/top-performers?publishToPage=${encodeURIComponent(publishToPage)}`);
      const d = await r.json();
      if (d.top) setTopPerformers(d.top);
    } finally { setTopLoading(false); }
  }

  function useTopPerformer(p: TopPerformer) {
    setParticulars(`Repost: ${(p.caption || "").slice(0, 60)}`);
    setCaption(p.caption || "");
    if (p.thumbnail) setMediaUrls([p.thumbnail]);
    setTopModalOpen(false);
  }

  const cleanMediaUrls = useMemo(() => mediaUrls.map((u) => u.trim()).filter(Boolean), [mediaUrls]);
  const canSubmit = particulars.trim().length > 0 && caption.trim().length > 0 && cleanMediaUrls.length > 0 && !submitting;

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      let scheduleTimeISO: string | undefined;
      if (scheduleEnabled && scheduleDate && scheduleTime) {
        const local = new Date(`${scheduleDate}T${scheduleTime}:00`);
        if (!Number.isNaN(local.getTime())) scheduleTimeISO = local.toISOString();
      }
      const res = await fetch("/api/scheduler/create-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          particulars: particulars.trim(),
          publishTo,
          publishToPage,
          caption,
          mediaUrls: cleanMediaUrls,
          scheduleTimeISO,
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        setResult({ ok: false, error: d.error || `HTTP ${res.status}` });
      } else {
        setResult({ ok: true, recordId: d.recordId });
        // Reset minimal fields, keep brand picked
        setParticulars(""); setCaption(""); setMediaUrls([""]); setScheduleEnabled(false); setScheduleDate(""); setScheduleTime("");
        // refresh queue to surface the new row (will appear once n8n syncs)
        setTimeout(loadQueue, 1500);
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  const previewImage = cleanMediaUrls[0] || null;
  const previewHandle = publishToPage === "GooCampus Main" ? "goocampus" :
                        publishToPage === "GooCampus World" ? "goocampusworld" : "12thplusdotcom";

  return (
    <>
      {/* Repost-top-performer call-to-action */}
      <div className="mb-4 flex items-center justify-between bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-200 rounded-2xl px-4 py-2.5">
        <div className="text-xs text-violet-900">
          <span className="font-medium">💡 Want to start from a winner?</span>{" "}
          <span className="text-violet-700">Pull a top-performing post from the last 90 days and tweak.</span>
        </div>
        <button
          onClick={openTopPerformers}
          className="text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700"
        >
          ↻ Pick top performer
        </button>
      </div>

      {/* TWO-COLUMN LAYOUT: form left, preview right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* LEFT — form */}
        <div className="lg:col-span-7 space-y-4">
          <Card title="Post to">
            <div className="space-y-2">
              {PAGE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${
                    publishToPage === opt.value ? "border-brand bg-brand-light/40" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="page"
                    checked={publishToPage === opt.value}
                    onChange={() => setPublishToPage(opt.value)}
                    className="accent-brand"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Media" subtitle="Drop a file to upload, or paste a URL (Slack / Drive / direct image / video). For carousels add multiple (max 10).">
            <MediaUploader mediaUrls={mediaUrls} setMediaUrls={setMediaUrls} />
          </Card>

          <Card title="Post details">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Internal title (Particulars)</label>
                <input
                  value={particulars}
                  onChange={(e) => setParticulars(e.target.value)}
                  placeholder="e.g. AMC August intake — reel #3"
                  className="w-full mt-1 text-sm rounded-lg border border-gray-200 px-3 py-2"
                />
                <div className="text-[10px] text-gray-400 mt-1">For your team — not shown on Instagram.</div>
              </div>
              {/* Content brief — topic anchor for the AI caption suggester */}
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">📝 What&apos;s this post about? <span className="normal-case text-gray-400 font-normal">(optional — helps AI write better captions)</span></label>
                <textarea
                  value={contentBrief}
                  onChange={(e) => setContentBrief(e.target.value)}
                  placeholder="e.g. New AMC Part 1 syllabus changes for 2026 IMG candidates, focus on OSCE additions and 3-month study plan"
                  rows={2}
                  className="w-full mt-1 text-sm rounded-lg border border-gray-200 px-3 py-2 font-sans"
                />
                <div className="text-[10px] text-gray-400 mt-1">Never sent to Instagram — this is just for you and the AI suggester.</div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write your caption…"
                  rows={6}
                  className="w-full mt-1 text-sm rounded-lg border border-gray-200 px-3 py-2 font-sans"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>n8n Sync V3 will split this into IG / FB versions and strip markdown.</span>
                  <span>{caption.length} / 2200</span>
                </div>

                {/* AI suggest button + variants panel */}
                <AISuggestBar
                  brand={publishToPage}
                  contentBrief={contentBrief}
                  caption={caption}
                  suggestions={suggestions}
                  loading={suggestLoading}
                  error={suggestError}
                  onFetch={async () => {
                    setSuggestError(null);
                    setSuggestLoading(true);
                    try {
                      const r = await fetch("/api/scheduler/suggest-caption", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ publishToPage, contentBrief, currentCaption: caption }),
                      });
                      const d = await r.json();
                      if (!r.ok) { setSuggestError(d.error || `HTTP ${r.status}`); setSuggestions(null); }
                      else { setSuggestions((d.variants as SuggestVariant[]) || []); }
                    } catch (e) { setSuggestError((e as Error).message); }
                    finally { setSuggestLoading(false); }
                  }}
                  onUse={(v) => {
                    // Merge caption + hashtags (only append hashtags not already inline)
                    const captionText = v.caption;
                    const inlineTags = new Set((captionText.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()));
                    const extras = v.hashtags.filter((h) => !inlineTags.has("#" + h.toLowerCase()));
                    setCaption(extras.length > 0 ? `${captionText}\n\n${extras.map((h) => "#" + h).join(" ")}` : captionText);
                    setSuggestions(null);
                  }}
                  onDismiss={() => setSuggestions(null)}
                />

                {/* Existing reach-prediction overlay (as-you-type) */}
                {caption.trim().length > 0 && (
                  <PredictionPanel
                    loading={predictionLoading}
                    prediction={prediction}
                    onAddHashtag={(tag) => setCaption((c) => c.trimEnd() + " #" + tag)}
                  />
                )}
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Publish to</label>
                <div className="flex gap-2 mt-1">
                  {PUBLISH_TO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPublishTo(opt.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${
                        publishTo === opt.value ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="mr-1">{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Schedule">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                {scheduleEnabled ? "Publish at the exact time below" : "Defaults to ~2 hours from now (n8n Sync V3's default)"}
              </span>
              <button
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`relative inline-flex items-center h-5 rounded-full w-9 transition ${scheduleEnabled ? "bg-brand" : "bg-gray-200"}`}
                aria-label="Toggle schedule"
              >
                <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow transition ${scheduleEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {scheduleEnabled && (
              <>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="text-sm rounded-lg border border-gray-200 px-3 py-2"
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="text-sm rounded-lg border border-gray-200 px-3 py-2"
                  />
                </div>

                {/* Smart time suggestions */}
                {timeSuggestions.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1.5">✨ Smart suggestions — when your audience is most online</div>
                    <div className="flex flex-wrap gap-2">
                      {timeSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => applyTimeSuggestion(s)}
                          className="text-xs bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 rounded-lg px-3 py-1.5 transition"
                          title={`Next ${s.weekdayLabel} at ${s.hourLabel} — ${s.followersOnline.toLocaleString("en-IN")} followers typically online`}
                        >
                          <span className="font-semibold">{s.weekdayLabel} {s.hourLabel}</span>
                          <span className="text-violet-600 ml-1">· {s.followersOnline.toLocaleString("en-IN")} online</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* RIGHT — Instagram preview */}
        <div className="lg:col-span-5">
          <div className="sticky top-6">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-3">Instagram Feed preview</div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-sm mx-auto">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-medium">
                  {previewHandle.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-sm font-semibold text-gray-900">{previewHandle}</div>
                <div className="ml-auto text-gray-400">⋯</div>
              </div>
              {/* Media */}
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="text-center text-gray-300 p-8">
                    <div className="text-5xl mb-2">🖼️</div>
                    <div className="text-xs">Paste a media URL above to preview</div>
                  </div>
                )}
              </div>
              {/* Action bar */}
              <div className="flex items-center gap-4 px-3 py-2 text-xl">
                <span>♡</span>
                <span>💬</span>
                <span>↗</span>
                <span className="ml-auto">🔖</span>
              </div>
              {/* Caption */}
              <div className="px-3 pb-3 text-xs">
                <span className="font-semibold mr-1.5">{previewHandle}</span>
                <span className="text-gray-800 whitespace-pre-wrap">
                  {caption ? (caption.length > 220 ? caption.slice(0, 220) + "… more" : caption) : <span className="text-gray-400 italic">Your caption will appear here</span>}
                </span>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-gray-400 text-center">
              Carousel slides + reel videos render as the first frame here. The actual post on IG matches your media list.
            </div>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3 flex items-center justify-between mb-8 sticky bottom-2">
        <div className="text-xs text-gray-500">
          {result?.ok === true && <span className="text-green-700">✓ Scheduled. Row <code className="bg-green-50 px-1 rounded">{result.recordId}</code> dropped into Content Calendar.</span>}
          {result?.ok === false && <span className="text-red-700">✗ {result.error}</span>}
          {!result && <span>Writes to Airtable Content Calendar · your n8n picks it up within 1 min · publishes within 1 min after that.</span>}
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="text-sm font-medium bg-brand text-white px-5 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : scheduleEnabled ? "Schedule" : "Publish"}
        </button>
      </div>

      {/* Top performer modal */}
      {topModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTopModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-900">Top performers</div>
                <div className="text-[11px] text-gray-500">Best posts on {publishToPage} in the last 90 days, by reach. Click one to pre-fill the form.</div>
              </div>
              <button onClick={() => setTopModalOpen(false)} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
            </div>
            <div className="p-5">
              {topLoading && <div className="text-center text-sm text-gray-500 py-8">Loading top performers…</div>}
              {!topLoading && topPerformers.length === 0 && <div className="text-center text-sm text-gray-500 py-8">No posts found in the last 90 days.</div>}
              {!topLoading && topPerformers.length > 0 && (
                <div className="space-y-2">
                  {topPerformers.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => useTopPerformer(p)}
                      className="w-full text-left flex gap-4 p-3 border border-gray-100 rounded-xl hover:border-violet-300 hover:bg-violet-50/30 transition"
                    >
                      <div className="flex-shrink-0">
                        {p.thumbnail ? (
                          <img src={p.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">📷</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-semibold text-violet-700">#{i + 1}</span>
                          <span className="text-[10px] uppercase tracking-wide text-gray-400">{p.mediaType}</span>
                          <span className="text-[10px] text-gray-400">· {new Date(p.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        </div>
                        <div className="text-xs text-gray-700 line-clamp-2">{p.caption || "(no caption)"}</div>
                        <div className="flex items-center gap-4 mt-1.5 text-[11px] text-gray-500">
                          <span><span className="font-semibold text-gray-800">{p.reach.toLocaleString("en-IN")}</span> reach</span>
                          <span>{p.likes.toLocaleString("en-IN")} likes</span>
                          <span>{p.comments.toLocaleString("en-IN")} comments</span>
                          <a href={p.permalink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto text-violet-600 hover:underline">View ↗</a>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUEUE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Recent + upcoming posts</div>
            <div className="text-[11px] text-gray-500">Read from your Post Scheduler table (n8n's queue)</div>
          </div>
          <LiveIndicator fetchedAt={queueFetchedAt} latencyMs={queueLatency} loading={queueLoading} onRefresh={loadQueue} />
        </div>
        {queue.length === 0 && !queueLoading && (
          <div className="px-5 py-8 text-center text-sm text-gray-500">No rows in Post Scheduler yet.</div>
        )}
        <div className="divide-y divide-gray-100">
          {queue.map((p) => (
            <QueueRow key={p.id} post={p} />
          ))}
        </div>
      </div>
    </>
  );
}

function QueueRow({ post }: { post: ScheduledPost }) {
  const statusColor =
    post.status === "Published" ? "bg-green-50 text-green-700 border-green-200" :
    post.status === "Publishing" ? "bg-amber-50 text-amber-800 border-amber-200" :
    post.status === "To Be Scheduled" ? "bg-violet-50 text-violet-700 border-violet-200" :
    "bg-gray-50 text-gray-600 border-gray-200";

  const when = post.publishedAt || post.scheduleTime;
  const whenLabel = when ? new Date(when).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{post.particulars || "(no title)"}</span>
          <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusColor}`}>{post.status}</span>
          <span className="text-[10px] text-gray-400">{post.publishToPage}</span>
        </div>
        {post.caption && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{post.caption}</div>}
      </div>
      <div className="text-xs text-gray-500 whitespace-nowrap">{whenLabel}</div>
      <div className="flex gap-2 text-xs">
        {post.instagramUrl && <a href={post.instagramUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">IG ↗</a>}
        {post.facebookUrl && <a href={post.facebookUrl.split("\n")[0]} target="_blank" rel="noreferrer" className="text-brand hover:underline">FB ↗</a>}
      </div>
    </div>
  );
}

function MediaUploader({ mediaUrls, setMediaUrls }: { mediaUrls: string[]; setMediaUrls: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploading(true);
    try {
      // First, drop the trailing empty URL slot if it exists, so uploads append cleanly
      const base = mediaUrls.filter((u, i) => u.trim() || i === 0 && mediaUrls.length === 1 && !u);
      const filtered = base.length === 1 && !base[0].trim() ? [] : base.filter((u) => u.trim());
      const next = [...filtered];
      for (const file of Array.from(files)) {
        if (next.length >= 10) { setUploadError("Max 10 media items per post"); break; }
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/scheduler/upload-media", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok || d.error) { setUploadError(d.error || `HTTP ${r.status}`); break; }
        next.push(d.url);
      }
      setMediaUrls(next.length > 0 ? next : [""]);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      <label
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition ${
          dragOver ? "border-brand bg-brand-light/40" : "border-gray-300 hover:border-brand hover:bg-gray-50"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files); e.target.value = ""; }}
        />
        <div className="text-center">
          {uploading ? (
            <div className="text-sm text-brand flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              Uploading…
            </div>
          ) : (
            <>
              <div className="text-2xl mb-1">📎</div>
              <div className="text-sm font-medium text-gray-700">Drag a file here or click to upload</div>
              <div className="text-[11px] text-gray-500 mt-0.5">jpg · png · webp · gif · mp4 · mov · webm · up to 50 MB</div>
            </>
          )}
        </div>
      </label>

      {uploadError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {uploadError}</div>
      )}

      {/* OR paste URL */}
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">— or paste URL —</div>
      <div className="space-y-2">
        {mediaUrls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => { const n = [...mediaUrls]; n[i] = e.target.value; setMediaUrls(n); }}
              placeholder="https://… (image, video, reel, or Slack/Drive link)"
              className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2"
            />
            {url.trim() && (
              <span className="text-xs text-green-600 self-center" title="Ready to use">✓</span>
            )}
            {mediaUrls.length > 1 && (
              <button
                type="button"
                onClick={() => setMediaUrls(mediaUrls.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-600 px-2"
                title="Remove"
              >×</button>
            )}
          </div>
        ))}
        {mediaUrls.length < 10 && (
          <button
            type="button"
            onClick={() => setMediaUrls([...mediaUrls, ""])}
            className="text-xs text-brand hover:underline"
          >+ Add another URL (for carousel)</button>
        )}
      </div>
    </div>
  );
}

// AI caption suggester UI — button first, 3 variant cards when suggestions arrive.
// No auto-trigger; the user is always in control. Cards support "Use this" which
// replaces the caption + appends any missing hashtags, or "Dismiss" to hide the row.
function AISuggestBar({
  brand, contentBrief, caption, suggestions, loading, error, onFetch, onUse, onDismiss,
}: {
  brand: string;
  contentBrief: string;
  caption: string;
  suggestions: Array<{ kind: "tone" | "seo" | "punchy"; caption: string; hashtags: string[]; prediction: Prediction | null }> | null;
  loading: boolean;
  error: string | null;
  onFetch: () => void;
  onUse: (v: { kind: "tone" | "seo" | "punchy"; caption: string; hashtags: string[]; prediction: Prediction | null }) => void;
  onDismiss: () => void;
}) {
  const canFetch = contentBrief.trim().length >= 10 && !loading;
  const kindMeta: Record<string, { emoji: string; label: string; sub: string }> = {
    tone: { emoji: "✏️", label: "Tone-matched", sub: "matches your usual voice" },
    seo: { emoji: "🎯", label: "SEO-optimized", sub: "search-friendly wording" },
    punchy: { emoji: "⚡", label: "Punchier", sub: "shorter, hook-forward" },
  };
  void caption; // reserved for future "compare vs your draft" chip

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onFetch}
          disabled={!canFetch}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
            canFetch
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
          title={contentBrief.trim().length < 10 ? "Fill in the 'What's this post about?' field first" : "Generate 3 caption variants"}
        >
          {loading ? "✨ Thinking…" : "✨ Get 3 AI caption variants"}
        </button>
        {!canFetch && contentBrief.trim().length < 10 && (
          <span className="text-[10px] text-gray-500">Add a topic in &ldquo;What&apos;s this post about?&rdquo; to enable</span>
        )}
        {suggestions && suggestions.length > 0 && (
          <button type="button" onClick={onDismiss} className="text-[11px] text-gray-500 hover:text-gray-800 underline">
            Dismiss suggestions
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          Suggestion failed: {error}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {suggestions.map((v, i) => {
            const meta = kindMeta[v.kind] || { emoji: "🪄", label: v.kind, sub: "" };
            return (
              <div key={i} className="bg-white border border-violet-200 rounded-xl p-3 flex flex-col shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{meta.emoji}</span>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{meta.label}</div>
                    <div className="text-[10px] text-gray-500">{meta.sub}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-800 whitespace-pre-wrap break-words leading-snug flex-1 mb-2 max-h-56 overflow-y-auto">
                  {v.caption}
                </div>
                {v.hashtags.length > 0 && (
                  <div className="text-[11px] text-violet-700 mb-2 leading-snug">
                    {v.hashtags.slice(0, 8).map((h) => "#" + h).join(" ")}
                  </div>
                )}
                {v.prediction && v.prediction.basis !== "no-data" && (
                  <div className="bg-violet-50 rounded-lg px-2.5 py-1.5 mb-2 text-[11px] text-violet-900">
                    📈 <b>Expected reach ~{v.prediction.avgReach.toLocaleString("en-IN")}</b>
                    <div className="text-[10px] text-violet-700/80 leading-snug">
                      {v.prediction.basis === "hashtag-overlap" && "strong hashtag match with past posts"}
                      {v.prediction.basis === "topic-keyword" && `topic match on ${v.prediction.matchedPosts} past post${v.prediction.matchedPosts === 1 ? "" : "s"}`}
                      {v.prediction.basis === "recent-avg" && "baseline: last 10 posts on this account"}
                    </div>
                  </div>
                )}
                {v.prediction?.basis === "no-data" && (
                  <div className="text-[11px] text-gray-500 mb-2">No past-post data yet to score this variant.</div>
                )}
                <button
                  type="button"
                  onClick={() => onUse(v)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark transition"
                >
                  Use this caption
                </button>
              </div>
            );
          })}
        </div>
      )}

      {loading && !suggestions && (
        <div className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          Reading your recent captions + generating 3 variants…
        </div>
      )}
    </div>
  );
  void brand; // brand is used indirectly by parent's onFetch; keep for future signature changes
}

function PredictionPanel({ loading, prediction, onAddHashtag }: {
  loading: boolean;
  prediction: Prediction | null;
  onAddHashtag: (tag: string) => void;
}) {
  if (loading && !prediction) {
    return (
      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="text-xs text-violet-700">📊 Analyzing similar past posts…</div>
      </div>
    );
  }
  if (!prediction) return null;
  if (prediction.basis === "no-data") {
    return (
      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="text-xs text-violet-700">📊 No past posts yet on this account to predict from.</div>
      </div>
    );
  }

  // Color-code the basis
  const basisChip = prediction.basis === "hashtag-overlap"
    ? { bg: "bg-emerald-100", text: "text-emerald-800", label: "STRONG MATCH" }
    : prediction.basis === "topic-keyword"
      ? { bg: "bg-violet-100", text: "text-violet-800", label: "TOPIC MATCH" }
      : { bg: "bg-amber-100", text: "text-amber-800", label: "BASELINE" };

  // Coaching messages — different per state
  const lift = prediction.hashtagLift;
  const liftHelps = lift && lift.liftPct > 10;            // hashtags help on this account
  const liftHurts = lift && lift.liftPct < -10;           // hashtags hurt on this account
  const liftNeutral = lift && !liftHelps && !liftHurts;

  let coachingLine: React.ReactNode = null;
  if (!prediction.captionHasHashtags && liftHelps) {
    coachingLine = (
      <>💡 Posts with hashtags average <b>{lift!.withAvgReach.toLocaleString("en-IN")}</b> reach vs <b>{lift!.withoutAvgReach.toLocaleString("en-IN")}</b> without — that&apos;s a <b>+{lift!.liftPct}%</b> lift on this account. Try adding 2-3 hashtags.</>
    );
  } else if (!prediction.captionHasHashtags && liftHurts) {
    coachingLine = (
      <>💡 On this account, posts <b>without</b> hashtags average <b>{lift!.withoutAvgReach.toLocaleString("en-IN")}</b> reach vs <b>{lift!.withAvgReach.toLocaleString("en-IN")}</b> with — hashtags hurt by <b>{Math.abs(lift!.liftPct)}%</b>. Long-form caption (no hashtags) is the winning style here.</>
    );
  } else if (!prediction.captionHasHashtags && liftNeutral) {
    coachingLine = <>💡 Hashtags don&apos;t meaningfully change reach on this account ({lift!.liftPct >= 0 ? "+" : ""}{lift!.liftPct}%). Your call.</>;
  } else if (prediction.captionHasHashtags && prediction.basis === "hashtag-overlap") {
    coachingLine = <>✅ You&apos;re using hashtags this account has hit before — strong signal for the prediction.</>;
  } else if (prediction.captionHasHashtags && prediction.basis !== "hashtag-overlap") {
    coachingLine = <>⚠️ These hashtags are new for this account — no past performance data on them. Prediction falls back to topic/baseline match.</>;
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
      {/* Headline numbers */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${basisChip.bg} ${basisChip.text}`}>{basisChip.label}</span>
        <span className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold">Expected reach</span>
        <span className="text-lg font-bold tabular-nums text-violet-900">~{prediction.avgReach.toLocaleString("en-IN")}</span>
        <span className="text-xs text-violet-700">· {prediction.avgEngagement.toLocaleString("en-IN")} engagements · {prediction.avgLikes.toLocaleString("en-IN")} likes</span>
      </div>

      {/* Match basis explanation */}
      <div className="text-[11px] text-violet-700/90">
        {prediction.note}
        {prediction.hashtagsMatched.length > 0 && <> · matched: {prediction.hashtagsMatched.map((t) => `#${t}`).join(" ")}</>}
        {prediction.keywordsMatched.length > 0 && <> · keywords: {prediction.keywordsMatched.join(", ")}</>}
      </div>

      {/* Coaching line */}
      {coachingLine && (
        <div className="text-[11px] text-violet-800 leading-relaxed pt-1 border-t border-violet-200">{coachingLine}</div>
      )}

      {/* Hashtag suggestions — only when caption has none AND hashtags help */}
      {!prediction.captionHasHashtags && liftHelps && prediction.suggestedHashtags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[10px] uppercase tracking-wide text-violet-600 font-medium mr-1">Tap to add:</span>
          {prediction.suggestedHashtags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onAddHashtag(tag)}
              className="text-[11px] bg-white hover:bg-violet-100 border border-violet-300 text-violet-700 rounded-full px-2 py-0.5"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      {subtitle && <div className="text-[11px] text-gray-500 mt-0.5 mb-3">{subtitle}</div>}
      {!subtitle && <div className="mt-3" />}
      {children}
    </div>
  );
}
