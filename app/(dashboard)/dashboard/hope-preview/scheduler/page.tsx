"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { IconChevronRight, IconChevronLeft, IconChevronDown, IconCheck, IconCalendarEvent, IconClock, IconPlus } from "@tabler/icons-react";

type PublishTo = "Facebook" | "Instagram" | "Instagram/Facebook";
type PublishToPage = "GooCampus Main" | "GooCampus World" | "12Plus / GC India";

type ScheduledPost = {
  id: string;
  particulars: string;
  publishToPage: string;
  primaryInterest: string;
  platform: string;
  type: string;
  caption: string;
  fullCaption: string;
  igCaption: string;
  fbCaption: string;
  thumbnailUrl: string | null;
  scheduleTime: string | null;
  status: string;
  effectiveStatus: "scheduled" | "publishing" | "published" | "failed" | "draft" | "unknown";
  failureReason: string | null;
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
  publishToPage?: string; // which account it belongs to (set when merging across accounts)
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
    <HopeDashboardShell active="scheduler" title="Scheduler" subtitle="Create a post → it publishes to Instagram & Facebook in about 2 minutes (or schedule it for later)." hideAccountPicker>
      {() => <Scheduler />}
    </HopeDashboardShell>
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
  const [topLoading, setTopLoading] = useState(false);

  // Queue + queue-view state
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFetchedAt, setQueueFetchedAt] = useState<number | null>(null);
  const [queueLatency, setQueueLatency] = useState<number | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Show the create-post form as a modal overlay so it doesn't dominate the tab.
  // The queue-management view is the primary content now.
  const [showCreateForm, setShowCreateForm] = useState(false);
  // ── "To schedule" tab: Output-Ready content pulled straight from Supabase (mh_posts).
  //    Overview-style toggle: "To schedule" (produced content awaiting a publish
  //    action) vs "Publish & queue" (the manual composer + live queue). ──
  type ToScheduleItem = {
    id: string; title: string; status: string; sbu: string | null; type: string | null;
    caption: string | null; content: string | null; mediaUrls: string[]; assetLink: string | null;
    channel: string | null; defaultPage: string; publishingDate: string | null;
    airtableRecordId?: string | null;
  };
  const [schedTab, setSchedTab] = useState<"to_schedule" | "publish" | "top">("to_schedule");
  const [topAccount, setTopAccount] = useState<string>("all");
  const [toSchedule, setToSchedule] = useState<ToScheduleItem[]>([]);
  const [toScheduleLoading, setToScheduleLoading] = useState(true);
  const loadToSchedule = () => {
    setToScheduleLoading(true);
    fetch("/api/scheduler/to-schedule", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { posts?: ToScheduleItem[] }) => setToSchedule(d.posts || []))
      .catch(() => {})
      .finally(() => setToScheduleLoading(false));
  };
  useEffect(() => { loadToSchedule(); }, []);
  // When the composer is scheduling an EXISTING Output-Ready task, we carry its id
  // so publishing UPDATES that mh_posts row (and it leaves "To schedule"). null =
  // a brand-new manual post (INSERT).
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  // "To schedule" tab view: the new inline master-detail (list + live preview, no
  // popup) vs the classic card grid. selectedTaskId = which row's editor is open.
  const [toScheduleView, setToScheduleView] = useState<"list" | "cards">("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const openTaskRef = useRef<string | null>(null); // guards the async caption fetch against fast task switches
  // Which network the live preview mocks. IG/FB share the handle; LinkedIn uses the page name.
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>("instagram");
  // A scheduled/published post opened in the big full-screen view popup.
  const [calItem, setCalItem] = useState<CalendarItem | null>(null);
  // Open the manual composer pre-filled from an Output-Ready task.
  function scheduleFromTask(t: ToScheduleItem) {
    setSchedulingTaskId(t.id);
    setParticulars(t.title);
    setPublishToPage(t.defaultPage as PublishToPage);
    setCaption(t.caption || "");
    setMediaUrls(t.mediaUrls && t.mediaUrls.length ? t.mediaUrls : [""]);
    setShowCreateForm(true);
  }
  // Inline (no-modal) counterpart of scheduleFromTask: prefill the SAME composer
  // state the modal uses, but open the editor in place inside the list row. Clicking
  // an already-open row collapses it.
  function selectTask(t: ToScheduleItem) {
    if (selectedTaskId === t.id) { setSelectedTaskId(null); openTaskRef.current = null; return; }
    setSchedulingTaskId(t.id);
    setParticulars(t.title);
    setPublishToPage(t.defaultPage as PublishToPage);
    setCaption(t.caption || "");
    setMediaUrls(t.mediaUrls && t.mediaUrls.length ? t.mediaUrls : [""]);
    setScheduleEnabled(false);
    setResult(null);
    setSelectedTaskId(t.id);
    openTaskRef.current = t.id;
    // Auto-fill the caption from the Marketing Hub content (Airtable "Caption:" section).
    // mh_posts doesn't mirror the caption, so fetch it live when there isn't one already.
    if (!(t.caption && t.caption.trim()) && t.airtableRecordId) {
      fetch(`/api/scheduler/caption?recordId=${encodeURIComponent(t.airtableRecordId)}`)
        .then((r) => r.json())
        .then((d: { caption?: string }) => {
          // apply only if this task is still open and the user hasn't typed a caption
          if (d.caption && openTaskRef.current === t.id) {
            setCaption((cur) => (cur && cur.trim() ? cur : d.caption!));
          }
        })
        .catch(() => {});
    }
  }
  // When rescheduling a top performer, the creatives are locked (view-only) — you're
  // reposting the SAME media, only the caption changes.
  const [mediaLocked, setMediaLocked] = useState(false);
  const openManualComposer = () => { setSchedulingTaskId(null); setMediaLocked(false); setShowCreateForm(true); };
  // Filters for the queue
  const [filterPage, setFilterPage] = useState<string>("all");
  const [filterInterest, setFilterInterest] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // Per-row inline editing state
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editingCaptionText, setEditingCaptionText] = useState<string>("");
  const [captionSaving, setCaptionSaving] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null); // shows spinner on the row being acted on
  // Schedule-now modal — set to a post when the user clicks the button on a queue card.
  const [scheduleModalPost, setScheduleModalPost] = useState<ScheduledPost | null>(null);

  // Real published IG posts across ALL 3 GooCampus accounts — shown alongside the
  // scheduled posts in the Content Calendar. Each post is tagged with its account
  // (publishToPage) so tiles/filters can tell them apart.
  const [publishedIG, setPublishedIG] = useState([] as PublishedIG[]);
  useEffect(() => {
    const accounts: { id: string; page: string }[] = [
      { id: "goocampus", page: "GooCampus Main" },
      { id: "goocampusworld", page: "GooCampus World" },
      { id: "12thplusdotcom", page: "12Plus / GC India" },
    ];
    Promise.all(accounts.map((a) =>
      fetch(`/api/posts?accountId=${a.id}&limit=20&insights=true`)
        .then((r) => r.ok ? r.json() : { posts: [] })
        .then((d) => ((d.posts || []) as PublishedIG[]).map((p) => ({ ...p, publishToPage: a.page })))
        .catch(() => [] as PublishedIG[])
    )).then((results) => {
      const merged = results.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setPublishedIG(merged);
    });
  }, []);

  const loadQueue = () => {
    setQueueLoading(true);
    setQueueError(null);
    const t0 = Date.now();
    fetch("/api/scheduler/queue", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
        try { return JSON.parse(body); } catch { throw new Error(`Non-JSON: ${body.slice(0, 200)}`); }
      })
      .then((d: { posts?: ScheduledPost[]; error?: string }) => {
        if (d.error) { setQueueError(d.error); setQueue([]); }
        else { setQueue(d.posts || []); }
        setQueueFetchedAt(Date.now());
        setQueueLatency(Date.now() - t0);
      })
      .catch((e) => { setQueueError((e as Error).message); })
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

  // Top performers now live in their own tab. Fetch across the selected account(s),
  // merge, and sort by reach.
  const loadTopPerformers = async () => {
    setTopLoading(true);
    try {
      const pages = topAccount === "all" ? PAGE_OPTIONS.map((o) => o.value) : [topAccount];
      const results = await Promise.all(pages.map((pg) =>
        fetch(`/api/scheduler/top-performers?publishToPage=${encodeURIComponent(pg)}`)
          .then((r) => r.ok ? r.json() : { top: [] })
          .then((d) => ((d.top || []) as TopPerformer[]).map((t) => ({ ...t, publishToPage: pg })))
          .catch(() => [] as TopPerformer[])
      ));
      setTopPerformers(results.flat().sort((a, b) => b.reach - a.reach));
    } finally { setTopLoading(false); }
  };
  useEffect(() => { if (schedTab === "top") loadTopPerformers(); }, [schedTab, topAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click a winner → open the manual composer pre-filled to reschedule/repost it.
  // For a carousel we pull EVERY slide so all images come across, not just the cover.
  async function rescheduleTopPerformer(p: TopPerformer) {
    setSchedulingTaskId(null);
    setMediaLocked(true);
    if (p.publishToPage) setPublishToPage(p.publishToPage as PublishToPage);
    setParticulars(`Repost: ${(p.caption || "").slice(0, 60)}`);
    setCaption(p.caption || "");
    setMediaUrls(p.thumbnail ? [p.thumbnail] : [""]);
    setShowCreateForm(true);
    if (p.mediaType === "CAROUSEL_ALBUM") {
      const accId = p.publishToPage === "GooCampus World" ? "goocampusworld"
        : p.publishToPage === "12Plus / GC India" ? "12thplusdotcom" : "goocampus";
      try {
        const r = await fetch(`/api/scheduler/media-children?mediaId=${encodeURIComponent(p.id)}&accountId=${accId}`);
        const d = await r.json();
        if (Array.isArray(d.urls) && d.urls.length) setMediaUrls(d.urls);
      } catch { /* keep the thumbnail fallback */ }
    }
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
      // Supabase-native: write the post into the mh_posts publish queue. Updates the
      // Output-Ready task in place when scheduling one (schedulingTaskId), else inserts.
      const res = await fetch("/api/scheduler/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: schedulingTaskId || undefined,
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
        setResult({ ok: true, recordId: d.id });
        setParticulars(""); setCaption(""); setMediaUrls([""]); setScheduleEnabled(false); setScheduleDate(""); setScheduleTime(""); setSchedulingTaskId(null); setSelectedTaskId(null);
        loadToSchedule();               // the scheduled task leaves "To schedule"
        setTimeout(loadQueue, 800);
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
  const pageHandle = (p: string) => p === "GooCampus Main" ? "@goocampus" :
                        p === "GooCampus World" ? "@goocampusworld" : "@12thplusdotcom";
  const previewName = publishToPage === "GooCampus Main" ? "GooCampus" :
                      publishToPage === "GooCampus World" ? "GooCampus World" : "12th Plus · GC India";

  // Filter derived data for the queue view — computed here so we can also use it for
  // the status-counter strip.
  const queueFiltered = queue.filter((p) => {
    if (filterPage !== "all" && p.publishToPage !== filterPage) return false;
    if (filterInterest !== "all" && p.primaryInterest !== filterInterest) return false;
    if (filterStatus !== "all" && p.effectiveStatus !== filterStatus) return false;
    return true;
  });
  const readyToSchedule = queueFiltered.filter((p) => p.effectiveStatus === "scheduled");
  const publishing = queueFiltered.filter((p) => p.effectiveStatus === "publishing");
  const failed = queueFiltered.filter((p) => p.effectiveStatus === "failed");
  const publishedRecent = queueFiltered
    .filter((p) => p.effectiveStatus === "published")
    .sort((a, b) => new Date(b.publishedAt || b.scheduleTime || 0).getTime() - new Date(a.publishedAt || a.scheduleTime || 0).getTime())
    .slice(0, 20);
  // Populate filter dropdown options from the actual data so we don't hardcode.
  const availablePages = PAGE_OPTIONS.map((o) => o.value); // the 3 GooCampus accounts, always
  const publishedFiltered = filterPage === "all" ? publishedIG : publishedIG.filter((p) => p.publishToPage === filterPage);
  const availableInterests = Array.from(new Set(queue.map((p) => p.primaryInterest).filter(Boolean))).sort();

  async function handleReschedule(recordId: string, iso: string) {
    setRowActionId(recordId);
    try {
      const r = await fetch("/api/scheduler/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, scheduleTime: iso }),
      });
      const d = await r.json();
      if (!r.ok || d.error) alert(`Reschedule failed: ${d.error || "HTTP " + r.status}`);
      else loadQueue();
    } finally { setRowActionId(null); }
  }
  async function handlePublishNow(recordId: string) {
    if (!confirm("Publish this post right now (within ~1 min)?")) return;
    setRowActionId(recordId);
    try {
      const r = await fetch("/api/scheduler/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) alert(`Publish failed: ${d.error || "HTTP " + r.status}`);
      else loadQueue();
    } finally { setRowActionId(null); }
  }
  async function handleSaveCaption() {
    if (!editingCaptionId) return;
    setCaptionSaving(true);
    try {
      const r = await fetch("/api/scheduler/edit-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: editingCaptionId, caption: editingCaptionText }),
      });
      const d = await r.json();
      if (!r.ok || d.error) alert(`Caption update failed: ${d.error || "HTTP " + r.status}`);
      else { setEditingCaptionId(null); setEditingCaptionText(""); loadQueue(); }
    } finally { setCaptionSaving(false); }
  }

  return (
    <>
      {/* Tab toggle — Output-Ready content to schedule vs the manual composer + queue */}
      <div className="mb-4 inline-flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
        <button
          onClick={() => setSchedTab("to_schedule")}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${schedTab === "to_schedule" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}
        >
          To schedule {toSchedule.length > 0 && <span className={schedTab === "to_schedule" ? "text-white/70" : "text-gray-400"}>{toSchedule.length}</span>}
        </button>
        <button
          onClick={() => setSchedTab("publish")}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${schedTab === "publish" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}
        >
          Calendar
        </button>
        <button
          onClick={() => setSchedTab("top")}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${schedTab === "top" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}
        >
          Top performers
        </button>
      </div>

      {schedTab === "to_schedule" && (
        <div>
          {/* Header + view toggle (List = inline master-detail · Cards = classic grid) */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">Ready to schedule</div>
              <div className="text-[12px] text-gray-500">Produced content awaiting a publish action — click a post to open it right here.</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadToSchedule} className="text-xs font-medium bg-white text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:border-gray-300">↻ Refresh</button>
              <button onClick={openManualComposer} className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark">+ Add manual post</button>
            </div>
          </div>

          {/* Pipeline status: content awaiting scheduling → scheduled → publishing → published/failed */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            <StatusCounter label="Ready to schedule" count={toSchedule.length} color="amber" />
            <StatusCounter label="Scheduled" count={readyToSchedule.length} color="violet" />
            <StatusCounter label="Publishing" count={publishing.length} color="blue" />
            <StatusCounter label="Published (recent)" count={publishedRecent.length} color="green" />
            <StatusCounter label="Failed" count={failed.length} color="rose" />
          </div>

          {(
            <>
              {toScheduleLoading && <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">Loading produced content…</div>}
              {!toScheduleLoading && toSchedule.length === 0 && (
                <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-500">Nothing waiting — everything produced has been scheduled. 🎉</div>
              )}
              {!toScheduleLoading && toSchedule.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* LEFT — clickable list; the selected row expands its editor inline */}
                  <div className="lg:col-span-7 space-y-2">
                    {toSchedule.map((t) => {
                      const open = selectedTaskId === t.id;
                      return (
                        <div key={t.id} className={`bg-white rounded-xl border ${open ? "border-brand" : "border-gray-200"}`}>
                          <button onClick={() => selectTask(t)} className={`w-full flex items-center gap-3 px-3.5 py-3 text-left ${open ? "bg-brand-light/30 rounded-t-xl" : "hover:bg-gray-50 rounded-xl"}`}>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                              <div className="text-[11px] text-gray-500 truncate">{pageHandle(t.defaultPage)}{t.type ? ` · ${t.type}` : ""}</div>
                            </div>
                            {/* Publishing date at the right corner — when it's set to go out */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {(() => {
                                if (!t.publishingDate) return <span className="text-[11px] text-gray-300">no date</span>;
                                const d = new Date(t.publishingDate);
                                const label = Number.isNaN(d.getTime()) ? t.publishingDate : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                                return <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 tabular-nums bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 whitespace-nowrap"><IconCalendarEvent size={13} stroke={1.8} className="text-gray-400" />{label}</span>;
                              })()}
                              <IconChevronRight size={16} stroke={2.2} className={`transition-transform ${open ? "text-brand rotate-90" : "text-gray-400"}`} />
                            </div>
                          </button>

                          {open && (
                            <div className="border-t border-gray-100 px-3 py-3 space-y-3">
                              <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Post name</label>
                                <input value={particulars} onChange={(e) => setParticulars(e.target.value)} className="w-full mt-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2" />
                              </div>
                              <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Post to</label>
                                <div className="mt-1"><PageDropdown value={publishToPage} onChange={setPublishToPage} /></div>
                              </div>
                              <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Creatives</label>
                                <div className="mt-1"><MediaUploader mediaUrls={mediaUrls} setMediaUrls={setMediaUrls} /></div>
                              </div>
                              <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Caption</label>
                                <AutoTextarea value={caption} onChange={setCaption} placeholder="Write your caption…" className="w-full mt-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2 font-sans" />
                                <div className="text-right text-[10px] text-gray-400 mt-0.5">{caption.length} / 2200</div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-700">{scheduleEnabled ? "Publish at the time below" : "Publish now"}</span>
                                <button onClick={() => setScheduleEnabled(!scheduleEnabled)} className={`relative inline-flex items-center h-5 rounded-full w-9 transition ${scheduleEnabled ? "bg-brand" : "bg-gray-200"}`} aria-label="Toggle schedule">
                                  <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow transition ${scheduleEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                                </button>
                              </div>
                              {scheduleEnabled && (
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    <HopeDatePicker value={scheduleDate} onChange={setScheduleDate} />
                                    <HopeTimePicker value={scheduleTime} onChange={setScheduleTime} />
                                  </div>
                                  {/* Friendly, unambiguous confirmation of the exact date it'll go out */}
                                  {(() => {
                                    if (!scheduleDate || !scheduleTime) return null;
                                    const dt = new Date(`${scheduleDate}T${scheduleTime}`);
                                    if (Number.isNaN(dt.getTime())) return null;
                                    const label = dt.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
                                    return <div className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">📅 Goes out <span className="font-medium">{label}</span></div>;
                                  })()}
                                  {timeSuggestions.length > 0 && (
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mb-1.5">✨ Best time to post — when your audience is most online</div>
                                      <div className="flex flex-wrap gap-2">
                                        {timeSuggestions.map((s, i) => {
                                          const d = new Date(s.nextOccurrenceISO);
                                          const dateLbl = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                                          return (
                                            <button key={i} type="button" onClick={() => applyTimeSuggestion(s)}
                                              className="text-xs bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 rounded-lg px-2.5 py-1.5 transition"
                                              title={`Scheduled for ${s.weekdayLabel} ${dateLbl} at ${s.hourLabel} — ${s.followersOnline.toLocaleString("en-IN")} followers typically online`}>
                                              <span className="font-semibold">{s.weekdayLabel} {dateLbl} · {s.hourLabel}</span>
                                              <span className="text-violet-600 ml-1">· {s.followersOnline.toLocaleString("en-IN")} online</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                                <span className="text-[11px]">
                                  {result?.ok === true ? <span className="text-green-700">✓ Scheduled — moved to the queue.</span>
                                    : result?.ok === false ? <span className="text-red-700">✗ {result.error}</span>
                                    : <span className="text-gray-500">to <b className="text-gray-700">{pageHandle(publishToPage)}</b></span>}
                                </span>
                                <button onClick={submit} disabled={!canSubmit} className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed">
                                  {submitting ? "Sending…" : scheduleEnabled ? "Schedule →" : "Publish →"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* RIGHT — sticky live preview with an Instagram / Facebook / LinkedIn switcher */}
                  <div className="lg:col-span-5">
                    <div className="sticky top-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Feed preview</div>
                        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
                          {(["instagram", "facebook", "linkedin"] as PreviewPlatform[]).map((p) => (
                            <button key={p} onClick={() => setPreviewPlatform(p)}
                              className={`text-[11px] font-medium px-2.5 py-1 rounded-md capitalize transition ${previewPlatform === p ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      {selectedTaskId ? (
                        <SocialPreview platform={previewPlatform} handle={previewHandle} name={previewName} images={cleanMediaUrls} caption={caption} />
                      ) : (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 max-w-sm mx-auto">Select a post on the left to preview it here.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {schedTab === "publish" && (<>
      {/* Header — queue actions strip */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="text-base font-semibold text-gray-900">Content calendar</div>
          <div className="text-[12px] text-gray-500">
            Everything scheduled and published — click a post to open it.
            {queueError && <span className="ml-2 text-rose-600">· Couldn&apos;t load the queue: {queueError}</span>}
          </div>
        </div>
        <LiveIndicator fetchedAt={queueFetchedAt} latencyMs={queueLatency} loading={queueLoading} onRefresh={loadQueue} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <span className="text-gray-500 uppercase tracking-wide font-medium mr-1">Filter:</span>
        <HopeSelect value={filterPage} onChange={setFilterPage}
          options={[{ value: "all", label: "All accounts" }, ...availablePages.map((p) => ({ value: p, label: p }))]} />
        {filterPage !== "all" && (
          <button onClick={() => setFilterPage("all")}
            className="text-gray-500 hover:text-gray-800 underline">clear</button>
        )}
      </div>

      {/* Actionable queue (failed / publishing / waiting) — stacked full-width above
          the calendar so nothing needing attention gets buried. */}
      {(failed.length > 0 || publishing.length > 0 || readyToSchedule.length > 0) && (
        <div className="space-y-4 mb-4">
          {failed.length > 0 && (
            <QueueSection
              title="Failed — needs attention"
              subtitle={`${failed.length} post${failed.length === 1 ? "" : "s"} didn't publish — retry or fix the media`}
              posts={failed}
              onReschedule={handleReschedule} onPublishNow={handlePublishNow}
              onEdit={(p) => { setEditingCaptionId(p.id); setEditingCaptionText(p.fullCaption || p.caption || ""); }}
              onScheduleNow={(p) => setScheduleModalPost(p)} rowActionId={rowActionId} accent="rose" expanded
            />
          )}
          {publishing.length > 0 && (
            <QueueSection
              title="Publishing now"
              subtitle="Going out to Instagram / Facebook right now"
              posts={publishing}
              onReschedule={handleReschedule} onPublishNow={handlePublishNow}
              onEdit={(p) => { setEditingCaptionId(p.id); setEditingCaptionText(p.fullCaption || p.caption || ""); }}
              onScheduleNow={(p) => setScheduleModalPost(p)} rowActionId={rowActionId} accent="blue" expanded
            />
          )}
          {readyToSchedule.length > 0 && (
            <QueueSection
              title="Waiting to publish"
              subtitle={`${readyToSchedule.length} post${readyToSchedule.length === 1 ? "" : "s"} queued — set a time or publish now`}
              posts={readyToSchedule}
              onReschedule={handleReschedule} onPublishNow={handlePublishNow}
              onEdit={(p) => { setEditingCaptionId(p.id); setEditingCaptionText(p.fullCaption || p.caption || ""); }}
              onScheduleNow={(p) => setScheduleModalPost(p)} rowActionId={rowActionId} accent="amber" expanded
            />
          )}
        </div>
      )}

      {/* Full-width calendar of everything scheduled & published — click a post to open it big. */}
      <MiniPlanner posts={queueFiltered} publishedIG={publishedFiltered} wide onSelect={setCalItem} />

      </>)}

      {schedTab === "top" && (
        <div>
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div className="text-base font-semibold text-gray-900">Top performers</div>
              <div className="text-[12px] text-gray-500">Your best posts by reach (last 90 days) — click one to reschedule it.</div>
            </div>
            <HopeSelect value={topAccount} onChange={setTopAccount}
              options={[{ value: "all", label: "All accounts" }, ...PAGE_OPTIONS.map((o) => ({ value: o.value, label: o.value }))]} />
          </div>

          {topLoading && <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">Loading top performers…</div>}
          {!topLoading && topPerformers.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-500">No posts found for this account in the last 90 days.</div>
          )}
          {!topLoading && topPerformers.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {topPerformers.map((p, i) => {
                const handle = p.publishToPage === "GooCampus World" ? "@goocampusworld" : p.publishToPage === "12Plus / GC India" ? "@12thplusdotcom" : "@goocampus";
                const fmt = (n: number) => n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
                return (
                  <button key={`${p.publishToPage}-${p.id}`} type="button" onClick={() => rescheduleTopPerformer(p)}
                    title={p.caption || "(no caption)"}
                    className="group text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-brand hover:shadow-md transition">
                    <div className="relative aspect-square bg-gray-100">
                      {p.thumbnail
                        ? <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">{p.mediaType === "VIDEO" ? "🎬" : "🖼️"}</div>}
                      <div className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded-full">#{i + 1}</div>
                      {p.mediaType === "CAROUSEL_ALBUM" && <div className="absolute top-1.5 right-1.5 text-white/90">▦</div>}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-center gap-2 text-[10px] text-white">
                        <span>{fmt(p.reach)} reach</span><span>{fmt(p.likes)} ♥</span>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition">
                        <span className="text-[11px] font-medium bg-white text-brand px-2.5 py-1 rounded-lg shadow">Reschedule →</span>
                      </div>
                    </div>
                    <div className="px-2 py-1.5 flex items-center justify-between text-[10px] text-gray-500">
                      <span className="truncate">{handle}</span>
                      <span className="flex-shrink-0 ml-1">{new Date(p.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Schedule-now modal */}
      {scheduleModalPost && (
        <ScheduleNowModal
          post={scheduleModalPost}
          onClose={() => setScheduleModalPost(null)}
          onConfirm={async (iso, pages) => {
            // Single page → update the row in place. Multiple pages → cross-post
            // (updates original + duplicates once per additional page).
            if (pages.length <= 1) {
              await handleReschedule(scheduleModalPost.id, iso);
            } else {
              setRowActionId(scheduleModalPost.id);
              try {
                const r = await fetch("/api/scheduler/schedule-multi", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ recordId: scheduleModalPost.id, scheduleTime: iso, pages }),
                });
                const d = await r.json();
                if (!r.ok || d.error) alert(`Cross-post failed: ${d.error || "HTTP " + r.status}`);
                else loadQueue();
              } finally { setRowActionId(null); }
            }
            setScheduleModalPost(null);
          }}
        />
      )}

      {/* Big full-screen view of a scheduled / published post */}
      {calItem && <SchedulePreviewModal item={calItem} onClose={() => setCalItem(null)} />}

      {/* Caption-edit modal */}
      {editingCaptionId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingCaptionId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Edit caption</div>
              <button onClick={() => setEditingCaptionId(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>
            <textarea
              value={editingCaptionText}
              onChange={(e) => setEditingCaptionText(e.target.value)}
              rows={12}
              className="w-full text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2 font-sans"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="text-[11px] text-gray-500">{editingCaptionText.length} / 2200 characters</div>
              <div className="flex gap-2">
                <button onClick={() => setEditingCaptionId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200">
                  Cancel
                </button>
                <button onClick={handleSaveCaption} disabled={captionSaving}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium ${captionSaving ? "bg-gray-200 text-gray-500" : "bg-brand text-white hover:bg-brand-dark"}`}>
                  {captionSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE-POST FORM MODAL ─────────────────────────────────────────
          The whole existing create-post form (media uploader / AI suggester /
          reach prediction / smart time / brand picker / etc.) lives in here
          — nothing was dropped, just moved out of the primary view. */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 z-40 overflow-y-auto"
          onClick={() => setShowCreateForm(false)}>
          <div className="min-h-screen py-8 px-4" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">Add a new post</div>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
              </div>

      {/* TWO-COLUMN LAYOUT: form left, preview right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* LEFT — form */}
        <div className="lg:col-span-7 space-y-4">
          <Card title="Post to">
            <PageDropdown value={publishToPage} onChange={setPublishToPage} />
          </Card>

          <Card title="Media" subtitle={mediaLocked ? "Reposting the original creatives — locked. Only the caption is editable." : "Drop a file to upload, or paste a URL (Slack / Drive / direct image / video). For carousels add multiple (max 10)."}>
            <MediaUploader mediaUrls={mediaUrls} setMediaUrls={setMediaUrls} locked={mediaLocked} />
          </Card>

          <Card title="Post details">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Internal title (Particulars)</label>
                <input
                  value={particulars}
                  onChange={(e) => setParticulars(e.target.value)}
                  placeholder="e.g. AMC August intake — reel #3"
                  className="w-full mt-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2"
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
                  className="w-full mt-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2 font-sans"
                />
                <div className="text-[10px] text-gray-400 mt-1">Never sent to Instagram — this is just for you and the AI suggester.</div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Caption</label>
                <AutoTextarea value={caption} onChange={setCaption} placeholder="Write your caption…" className="w-full mt-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2 font-sans" />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>We&apos;ll split this into Instagram / Facebook versions and strip markdown automatically.</span>
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
            </div>
          </Card>

          <Card title="Schedule">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-700">
                {scheduleEnabled ? "Publish at the time below" : "Publish now"}
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
                  <HopeDatePicker value={scheduleDate} onChange={setScheduleDate} />
                  <HopeTimePicker value={scheduleTime} onChange={setScheduleTime} />
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

        {/* RIGHT — live preview with an Instagram / Facebook / LinkedIn switcher */}
        <div className="lg:col-span-5">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Feed preview</div>
              <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
                {(["instagram", "facebook", "linkedin"] as PreviewPlatform[]).map((p) => (
                  <button key={p} type="button" onClick={() => setPreviewPlatform(p)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md capitalize transition ${previewPlatform === p ? "bg-brand text-white" : "text-gray-600 hover:text-gray-900"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <SocialPreview platform={previewPlatform} handle={previewHandle} name={previewName} images={cleanMediaUrls} caption={caption} />
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3 flex items-center justify-between mb-8 sticky bottom-2">
        <div className="text-xs text-gray-500">
          {result?.ok === true && <span className="text-green-700">✓ Scheduled. Row <code className="bg-green-50 px-1 rounded">{result.recordId}</code> dropped into Content Calendar.</span>}
          {result?.ok === false && <span className="text-red-700">✗ {result.error}</span>}
          {!result && <span>{scheduleEnabled ? "Goes into your publishing queue for the time you set." : "Goes straight into your publishing queue."}</span>}
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="text-sm font-medium bg-brand text-white px-5 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : scheduleEnabled ? "Schedule" : "Publish"}
        </button>
      </div>


            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Big status-count tile shown in the strip at the top of the queue view.
// The "To schedule" tab — produced (Output-Ready) content pulled from Supabase,
// each card ready to hand to the composer with account + caption + reach prediction.
type ToScheduleCard = {
  id: string; title: string; status: string; sbu: string | null; type: string | null;
  caption: string | null; content: string | null; mediaUrls: string[]; assetLink: string | null;
  channel: string | null; defaultPage: string; publishingDate: string | null;
};
function ToScheduleList({ items, loading, onRefresh, onSchedule, onAddManual, hideHeader }: {
  items: ToScheduleCard[]; loading: boolean; onRefresh: () => void;
  onSchedule: (t: ToScheduleCard) => void; onAddManual: () => void; hideHeader?: boolean;
}) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Direct upload for a task: file → Supabase Storage (post-media) → save on the
  // mh_posts row → refresh so the card shows the real thumbnail. No Slack.
  async function uploadForTask(postId: string, files: FileList) {
    setUploadingId(postId);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append("file", f);
        const r = await fetch("/api/scheduler/upload-media", { method: "POST", body: fd });
        const d = await r.json();
        if (r.ok && d.url) urls.push(d.url);
        else alert(`Upload failed: ${d.error || r.status}`);
      }
      if (urls.length) {
        await fetch("/api/scheduler/set-media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, mediaUrls: urls }) });
        onRefresh();
      }
    } finally { setUploadingId(null); }
  }
  const statusChip = (s: string) => s === "Ready to Publish"
    ? { bg: "#E3F5EA", text: "#157F3C" }
    : { bg: "#FEF3E2", text: "#B45309" };
  const pageChip: Record<string, string> = {
    "GooCampus Main": "@goocampus", "GooCampus World": "@goocampusworld", "GooCampus India": "@12thplusdotcom",
  };
  return (
    <div>
      {!hideHeader && (
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-base font-semibold text-gray-900">Ready to schedule</div>
          <div className="text-[12px] text-gray-500">Produced content awaiting a publish action — straight from the Content Calendar. Click Schedule to add the caption &amp; go out.</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="text-xs font-medium bg-white text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:border-gray-300">↻ Refresh</button>
          <button onClick={onAddManual} className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark">+ Add manual post</button>
        </div>
      </div>
      )}

      {loading && <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">Loading produced content…</div>}
      {!loading && items.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-100 px-5 py-12 text-center text-sm text-gray-500">
          Nothing waiting — everything produced has been scheduled. 🎉
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((t) => {
          const sc = statusChip(t.status);
          return (
            <div key={t.id} className="bg-white rounded-lg border border-gray-100 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900 leading-snug">{t.title}</div>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: sc.bg, color: sc.text }}>{t.status.replace("Output - ", "").replace(" to Publish", "")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.sbu && <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-light text-brand">{t.sbu}</span>}
                {t.type && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.type}</span>}
              </div>
              {t.mediaUrls.length > 0 ? (
                <div className="relative">
                  {/\.(mp4|mov|webm)(\?|$)/i.test(t.mediaUrls[0])
                    ? <video src={t.mediaUrls[0]} className="w-full h-28 object-cover rounded-md border border-gray-100" muted />
                    : <img src={t.mediaUrls[0]} alt="" className="w-full h-28 object-cover rounded-md border border-gray-100" />}
                  {t.mediaUrls.length > 1 && <span className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded-full">+{t.mediaUrls.length - 1}</span>}
                  <label className="absolute bottom-1 right-1 text-[10px] bg-white/90 text-gray-700 border border-gray-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white">
                    replace
                    <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files?.length) uploadForTask(t.id, e.target.files); e.currentTarget.value = ""; }} />
                  </label>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center gap-1 h-28 rounded-md border border-dashed cursor-pointer transition ${uploadingId === t.id ? "border-brand bg-brand-light/40" : "border-gray-300 hover:border-brand"}`}>
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files?.length) uploadForTask(t.id, e.target.files); e.currentTarget.value = ""; }} />
                  {uploadingId === t.id ? (
                    <span className="text-xs text-brand font-medium">Uploading…</span>
                  ) : (
                    <>
                      <span className="text-lg">↑</span>
                      <span className="text-xs text-gray-600 font-medium">Upload media</span>
                      {t.assetLink && <a href={t.assetLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-gray-400 hover:text-brand hover:underline">or grab from Slack ↗</a>}
                    </>
                  )}
                </label>
              )}
              <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-50">
                <span className="text-[11px] text-gray-500">defaults to <b className="text-gray-700">{pageChip[t.defaultPage] || t.defaultPage}</b></span>
                <button onClick={() => onSchedule(t)} className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand-dark">Schedule →</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusCounter({ label, count, color }: { label: string; count: number; color: "amber" | "violet" | "blue" | "green" | "rose" }) {
  // Hope UI stat card: clean white card, a small colour-coded dot, big number.
  const dot: Record<string, string> = { amber: "#F59E0B", violet: "#7C3AED", blue: "#3A57E8", green: "#1AA053", rose: "#E11D48" };
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: dot[color] }} />
        <span className="text-[11px] uppercase tracking-wide font-medium text-gray-400">{label}</span>
      </div>
      <div className="text-[26px] font-semibold text-gray-900 tabular-nums leading-none">{count}</div>
    </div>
  );
}

// One collapsible section of the queue (Failed / Publishing / Ready / Recently published).
// Renders rich cards with inline datetime picker + Publish now + Edit caption actions.
function QueueSection({
  title, subtitle, posts, onReschedule, onPublishNow, onEdit, onScheduleNow, rowActionId, accent, emptyOK, readonly, expanded,
}: {
  title: string;
  subtitle: string;
  posts: ScheduledPost[];
  onReschedule: (recordId: string, iso: string) => void;
  onPublishNow: (recordId: string) => void;
  onEdit: (post: ScheduledPost) => void;
  onScheduleNow?: (post: ScheduledPost) => void;
  rowActionId: string | null;
  accent: "amber" | "blue" | "green" | "rose";
  emptyOK?: boolean;
  readonly?: boolean;
  expanded?: boolean;   // richer per-row layout — bigger thumbnail, full caption, tag chips
}) {
  const bandColors: Record<string, string> = {
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    rose: "bg-rose-500",
  };
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
        <div className={`w-1 h-8 rounded-full ${bandColors[accent]}`} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-[11px] text-gray-500">{subtitle}</div>
        </div>
      </div>
      {posts.length === 0 && emptyOK && (
        <div className="px-5 py-12 text-center text-sm text-gray-400">
          Nothing here right now.
        </div>
      )}
      {posts.length > 0 && (
        <div className="divide-y divide-gray-100">
          {posts.map((p) => (
            <QueueRow
              key={p.id}
              post={p}
              onReschedule={onReschedule}
              onPublishNow={onPublishNow}
              onEdit={onEdit}
              onScheduleNow={onScheduleNow}
              busy={rowActionId === p.id}
              readonly={readonly}
              expanded={expanded}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QueueRow({ post, onReschedule, onPublishNow, onEdit, onScheduleNow, busy, readonly }: {
  post: ScheduledPost;
  onReschedule?: (recordId: string, iso: string) => void;
  onPublishNow?: (recordId: string) => void;
  onEdit?: (post: ScheduledPost) => void;
  onScheduleNow?: (post: ScheduledPost) => void;
  busy?: boolean;
  readonly?: boolean;
  expanded?: boolean;
}) {
  const statusColor =
    post.effectiveStatus === "published" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    post.effectiveStatus === "publishing" ? "bg-blue-50 text-blue-700 border-blue-200" :
    post.effectiveStatus === "scheduled" ? "bg-amber-50 text-amber-800 border-amber-200" :
    post.effectiveStatus === "failed" ? "bg-rose-50 text-rose-700 border-rose-200" :
    "bg-gray-50 text-gray-600 border-gray-200";
  const statusLabel = post.effectiveStatus === "scheduled" ? "Ready to schedule" :
    post.effectiveStatus.charAt(0).toUpperCase() + post.effectiveStatus.slice(1);

  const when = post.publishedAt || post.scheduleTime;
  const whenLabel = when ? new Date(when).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

  const typeIcon = post.type?.toLowerCase().includes("reel") ? "🎬" :
    post.type?.toLowerCase().includes("carousel") ? "🖼️" : "📄";

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      {/* Column 1 — post name + interest chip + type chip (stacked one below the other) */}
      <div className="w-44 shrink-0">
        <div className="text-sm font-semibold text-gray-900 leading-snug mb-1.5 line-clamp-2">
          {post.particulars || "(no title)"}
        </div>
        {post.primaryInterest && (
          <div className="inline-block text-[10px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5 mb-1 mr-1">
            {post.primaryInterest}
          </div>
        )}
        {post.type && (
          <div className="inline-block text-[10px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">
            {post.type}
          </div>
        )}
        {post.publishToPage && (
          <div className="text-[10px] text-gray-500 mt-1">{post.publishToPage}</div>
        )}
      </div>

      {/* Column 2 — carousel first slide / thumbnail */}
      <div className="w-28 h-28 shrink-0">
        {post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover rounded-lg border border-gray-100" />
        ) : (
          <div className="w-full h-full rounded-lg bg-gray-100 flex items-center justify-center text-4xl text-gray-400">
            {typeIcon}
          </div>
        )}
      </div>

      {/* Column 3 — caption */}
      <div className="flex-1 min-w-0">
        {post.caption ? (
          <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
            {post.caption}
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">No caption yet.</div>
        )}
        {post.failureReason && (
          <div className="text-[11px] text-rose-700 mt-2 bg-rose-50 border border-rose-100 rounded px-2 py-1">
            ⚠ {post.failureReason}
          </div>
        )}
      </div>

      {/* Column 4 — status + Schedule now button */}
      <div className="w-36 shrink-0 flex flex-col items-end gap-2">
        <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${statusColor}`}>
          {statusLabel}
        </span>
        {!readonly && (
          <button
            type="button"
            onClick={() => onScheduleNow?.(post)}
            disabled={busy}
            className="text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
          >
            📅 Schedule now
          </button>
        )}
        {!readonly && post.scheduleTime && (
          <div className="text-[10px] text-gray-500 text-right leading-tight">
            Current time slot:<br />
            <span className="text-gray-800 font-medium">{whenLabel}</span>
          </div>
        )}
        {readonly && (
          <>
            <div className="text-[10px] text-gray-500 text-right">Published {whenLabel}</div>
            {post.instagramUrl && <a href={post.instagramUrl} target="_blank" rel="noreferrer" className="text-[11px] text-violet-700 hover:underline">View on Instagram ↗</a>}
          </>
        )}
      </div>
    </div>
  );
}

// Schedule-now modal — picked-time chooser. Fetches best-time suggestions on open
// (scoped to the post's Publish To Page brand). User picks a slot, hits Confirm →
// PATCHes Schedule Time in Airtable and the row moves in the queue.
function ScheduleNowModal({ post, onClose, onConfirm }: {
  post: ScheduledPost;
  onClose: () => void;
  onConfirm: (iso: string, pages: string[]) => void | Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [customLocal, setCustomLocal] = useState<string>(
    post.scheduleTime
      ? new Date(new Date(post.scheduleTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : ""
  );
  const [saving, setSaving] = useState(false);
  // Cross-post: pre-select whichever page the row was tagged with; user can tick more
  // to fan-out. On confirm, one Airtable row is updated in place + one duplicate is
  // created for each additional page (same media/caption/interest, different Publish
  // To Page), so n8n's Native Scheduler fires one post per selected page.
  const ALL_PAGES = ["GooCampus Main", "GooCampus World", "12Plus / GC India"] as const;
  const [selectedPages, setSelectedPages] = useState<string[]>(
    post.publishToPage ? [post.publishToPage] : ["GooCampus Main"]
  );
  function togglePage(page: string) {
    setSelectedPages((prev) => prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]);
  }

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/scheduler/suggest-time?publishToPage=${encodeURIComponent(post.publishToPage || "GooCampus Main")}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setSuggestions((d?.suggestions || []) as TimeSuggestion[]))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [post.publishToPage]);

  async function pickAndConfirm(iso: string) {
    if (selectedPages.length === 0) { alert("Pick at least one page to publish to."); return; }
    setSaving(true);
    try { await onConfirm(iso, selectedPages); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold">📅 Schedule this post</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>
        <div className="text-[11px] text-gray-500 mb-4 line-clamp-1">{post.particulars || "(no title)"}</div>

        {/* Pages — tick one or more to cross-post */}
        <div className="mb-4">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Publish to {selectedPages.length > 1 && <span className="ml-1 text-violet-700 normal-case font-normal">· cross-posting to {selectedPages.length} pages</span>}
          </div>
          <div className="space-y-1.5">
            {ALL_PAGES.map((page) => {
              const checked = selectedPages.includes(page);
              const handle = page === "GooCampus Main" ? "@goocampus" :
                page === "GooCampus World" ? "@goocampusworld" : "@12thplusdotcom";
              return (
                <label
                  key={page}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition ${
                    checked ? "border-violet-400 bg-violet-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePage(page)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-900">{page}</div>
                    <div className="text-[10px] text-gray-500">{handle}</div>
                  </div>
                  {page === post.publishToPage && (
                    <span className="text-[9px] font-medium text-violet-700 uppercase tracking-wide">Original</span>
                  )}
                </label>
              );
            })}
          </div>
          {post.platform && (
            <div className="text-[10px] text-gray-500 mt-1.5">
              Platform: <span className="text-gray-700 font-medium">{post.platform}</span>
            </div>
          )}
        </div>

        {/* Best-time suggestions */}
        <div className="mb-4">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Good times to schedule
            <span className="text-gray-400 normal-case font-normal ml-1">— based on when your audience is most active</span>
          </div>
          {loading && <div className="text-xs text-gray-400 py-2">Loading suggestions…</div>}
          {!loading && suggestions.length === 0 && (
            <div className="text-xs text-gray-400 py-2">No suggestions available right now — pick a custom time below.</div>
          )}
          {!loading && suggestions.length > 0 && (
            <div className="space-y-1.5">
              {suggestions.slice(0, 5).map((s, i) => {
                const dt = new Date(s.nextOccurrenceISO);
                const label = dt.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
                return (
                  <button
                    key={i}
                    onClick={() => pickAndConfirm(s.nextOccurrenceISO)}
                    disabled={saving}
                    className="w-full flex items-center justify-between text-left bg-white border border-gray-200 hover:border-violet-400 hover:bg-violet-50/40 rounded-lg px-3 py-2 disabled:opacity-50 transition"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{label}</div>
                      <div className="text-[10px] text-gray-500">{s.followersOnline.toLocaleString()} followers online at {s.hourLabel}</div>
                    </div>
                    <div className="text-xs text-violet-700 font-medium">Schedule →</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom time */}
        <div>
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Or pick a custom time</div>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={customLocal}
              onChange={(e) => setCustomLocal(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5"
            />
            <button
              onClick={() => customLocal && pickAndConfirm(new Date(customLocal).toISOString())}
              disabled={!customLocal || saving}
              className="text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// (retained for API-compat with any callers below — the current queue view uses the
// new signature above, but a plain version of the row is kept in the legacy tree.)
// Content Calendar — right-rail sidebar. Shows two things grouped by day (newest first):
// (1) real published Instagram posts fetched from /api/posts (with the actual full image,
// not cropped), and (2) upcoming scheduled posts from Airtable. Post cards show the full
// image at proper aspect ratio, like Meta Ads Library.
type PublishedIG = {
  id: string; caption: string; mediaUrl: string; permalink: string; type: string;
  timestamp: string; likes: number; comments: number; reach: number;
  publishToPage: string; // which account it was published from (matches PAGE_OPTIONS values)
};

type CalendarItem =
  | { kind: "scheduled"; whenMs: number; post: ScheduledPost }
  | { kind: "published"; whenMs: number; post: PublishedIG };

type CalFilter = "all" | "today" | "yesterday" | "week" | "upcoming";

// Big full-screen view of a scheduled or published post — opened from the calendar.
// View-only: media, caption, status, account, and permalinks. Handles both kinds.
function SchedulePreviewModal({ item, onClose }: { item: CalendarItem; onClose: () => void }) {
  const isPub = item.kind === "published";
  const p = item.post as ScheduledPost & PublishedIG;
  const img: string | null = isPub ? (p.mediaUrl || null) : (p.thumbnailUrl || null);
  const caption: string = isPub ? (p.caption || "") : (p.fullCaption || p.caption || "");
  const when = new Date(item.whenMs).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const title: string = isPub ? "Published post" : (p.particulars || "Scheduled post");
  const status: string = isPub ? "published" : (p.effectiveStatus || "scheduled");
  const igUrl: string | null = isPub ? (p.permalink || null) : (p.instagramUrl || null);
  const fbUrl: string | null = isPub ? null : (p.facebookUrl || null);
  const account: string = (p.publishToPage === "GooCampus World") ? "@goocampusworld"
    : (p.publishToPage === "12Plus / GC India") ? "@12thplusdotcom"
    : isPub ? "@goocampus" : (p.publishToPage || "");
  const statusColor: Record<string, string> = {
    published: "bg-emerald-50 text-emerald-700", publishing: "bg-blue-50 text-blue-700",
    failed: "bg-rose-50 text-rose-700", scheduled: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <div className="text-[11px] text-gray-500">{when}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="grid md:grid-cols-2 min-h-0 overflow-auto">
          <div className="bg-gray-900 flex items-center justify-center p-4 min-h-[320px]">
            {img
              ? <img src={img} alt="" className="max-w-full max-h-[78vh] object-contain rounded-lg" />
              : <div className="text-gray-500 text-6xl">🖼️</div>}
          </div>
          <div className="p-5 space-y-4 overflow-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${statusColor[status] || "bg-gray-100 text-gray-700"}`}>{status}</span>
              {account && <span className="text-xs text-gray-500">{account}</span>}
            </div>
            {isPub && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Likes", value: p.likes ?? 0 },
                  { label: "Comments", value: p.comments ?? 0 },
                  { label: "Reach", value: p.reach ?? 0 },
                ].map((m) => (
                  <div key={m.label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-lg font-semibold text-gray-900 tabular-nums leading-none">{(m.value || 0).toLocaleString("en-IN")}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mt-1">{m.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Caption</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{caption || <span className="text-gray-400 italic">No caption</span>}</div>
            </div>
            {(igUrl || fbUrl) && (
              <div className="flex gap-2 pt-1">
                {igUrl && <a href={igUrl} target="_blank" rel="noreferrer" className="text-xs font-medium bg-brand text-white px-3 py-2 rounded-lg hover:bg-brand-dark">View on Instagram ↗</a>}
                {fbUrl && <a href={fbUrl} target="_blank" rel="noreferrer" className="text-xs font-medium bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:border-gray-300">View on Facebook ↗</a>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPlanner({ posts, publishedIG, wide, onSelect }: { posts: ScheduledPost[]; publishedIG: PublishedIG[]; wide?: boolean; onSelect?: (item: CalendarItem) => void }) {
  const [filter, setFilter] = useState<CalFilter>("all");

  const rawItems: CalendarItem[] = [
    ...posts.filter((p) => p.scheduleTime).map((p) => ({
      kind: "scheduled" as const, whenMs: new Date(p.scheduleTime as string).getTime(), post: p,
    })),
    ...publishedIG.map((p) => ({
      kind: "published" as const, whenMs: new Date(p.timestamp).getTime(), post: p,
    })),
  ];

  // Apply filter
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400 * 1000;
  const tomorrowStart = todayStart + 86400 * 1000;
  const weekAgo = todayStart - 7 * 86400 * 1000;

  const items = rawItems.filter((it) => {
    if (filter === "all") return true;
    if (filter === "today") return it.whenMs >= todayStart && it.whenMs < tomorrowStart;
    if (filter === "yesterday") return it.whenMs >= yesterdayStart && it.whenMs < todayStart;
    if (filter === "week") return it.whenMs >= weekAgo && it.whenMs < tomorrowStart;
    if (filter === "upcoming") return it.whenMs >= todayStart;
    return true;
  });

  // Group by yyyy-mm-dd
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const d = new Date(it.whenMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const arr = byDay.get(key);
    if (arr) arr.push(it);
    else byDay.set(key, [it]);
  }

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const dayKeys = Array.from(byDay.keys()).sort((a, b) => {
    const aFuture = a >= todayKey, bFuture = b >= todayKey;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    if (aFuture) return a.localeCompare(b);
    return b.localeCompare(a);
  });

  // Flat, dense ordering: upcoming soonest-first, then most-recent past — rendered
  // in ONE grid so every row fills the full width (no big empty gaps per day).
  const flatItems = [...items].sort((a, b) => {
    const aF = a.whenMs >= todayStart, bF = b.whenMs >= todayStart;
    if (aF !== bF) return aF ? -1 : 1;
    return aF ? a.whenMs - b.whenMs : b.whenMs - a.whenMs;
  });

  const filterChips: Array<{ key: CalFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: rawItems.length },
    { key: "today", label: "Today", count: rawItems.filter((i) => i.whenMs >= todayStart && i.whenMs < tomorrowStart).length },
    { key: "yesterday", label: "Yesterday", count: rawItems.filter((i) => i.whenMs >= yesterdayStart && i.whenMs < todayStart).length },
    { key: "week", label: "This week", count: rawItems.filter((i) => i.whenMs >= weekAgo && i.whenMs < tomorrowStart).length },
    { key: "upcoming", label: "Upcoming", count: rawItems.filter((i) => i.whenMs >= todayStart).length },
  ];

  function statusChip(kind: "scheduled" | "published", eff?: string): { dot: string; label: string } {
    if (kind === "published") return { dot: "bg-emerald-500", label: "Published" };
    if (eff === "publishing") return { dot: "bg-blue-500", label: "Publishing" };
    if (eff === "failed") return { dot: "bg-rose-500", label: "Failed" };
    return { dot: "bg-amber-400", label: "Scheduled" };
  }

  function fmtDay(key: string): { weekday: string; date: string; sub: string } {
    const d = new Date(key + "T00:00:00");
    const now = new Date();
    const diffDays = Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (86400 * 1000));
    let sub = "";
    if (diffDays === 0) sub = "Today";
    else if (diffDays === 1) sub = "Tomorrow";
    else if (diffDays === -1) sub = "Yesterday";
    else if (diffDays > 1 && diffDays < 8) sub = `in ${diffDays} days`;
    else if (diffDays < 0) sub = `${Math.abs(diffDays)} days ago`;
    return {
      weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
      date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      sub,
    };
  }

  function truncate(s: string, n: number): string {
    if (!s) return "";
    return s.length > n ? s.slice(0, n).trim() + "…" : s;
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-100 overflow-hidden ${wide ? "w-full" : "lg:sticky lg:top-4"}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-gray-900">Scheduled &amp; published</div>
        <div className="flex flex-wrap gap-1">
          {filterChips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                filter === c.key
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-600 border-gray-200 hover:border-brand"
              }`}
            >
              {c.label} <span className={filter === c.key ? "text-white/70" : "text-gray-400"}>{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {flatItems.length === 0 && (
        <div className="p-4 text-center text-[11px] text-gray-400">Nothing matches this filter.</div>
      )}

      <div className="max-h-[calc(100vh-220px)] min-h-[500px] overflow-y-auto p-2">
        {/* ONE dense grid over all posts so every row fills the width — no empty gaps.
            Each tile carries its own date + time. */}
        <div className="grid gap-2" style={{ gridTemplateColumns: wide ? "repeat(auto-fill, minmax(112px, 1fr))" : "repeat(auto-fill, minmax(84px, 1fr))" }}>
          {flatItems.map((it) => {
                  const dt = new Date(it.whenMs);
                  const t = `${dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
                  // Map "Publish To Page" → short handle chip shown under each tile.
                  const handleFor = (page: string): { short: string; color: string } => {
                    if (page === "GooCampus Main") return { short: "@goocampus", color: "bg-violet-50 text-violet-700 border-violet-200" };
                    if (page === "GooCampus World") return { short: "@goocampusworld", color: "bg-sky-50 text-sky-700 border-sky-200" };
                    if (page === "12Plus / GC India") return { short: "@12thplusdotcom", color: "bg-rose-50 text-rose-700 border-rose-200" };
                    return { short: page || "—", color: "bg-gray-50 text-gray-600 border-gray-200" };
                  };
                  if (it.kind === "published") {
                    const p = it.post;
                    const isReel = p.type === "REEL";
                    const handle = handleFor(p.publishToPage);
                    return (
                      <button
                        key={`pub-${p.id}`}
                        type="button"
                        onClick={() => onSelect?.(it)}
                        title={p.caption ? truncate(p.caption, 140) : "View post"}
                        className="group block w-full text-left rounded-md overflow-hidden border border-gray-200 hover:border-violet-400 hover:shadow-md transition"
                      >
                        <div className="relative">
                          {p.mediaUrl ? (
                            <img src={p.mediaUrl} alt="" className="w-full aspect-[3/4] object-cover" />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center text-lg text-gray-400">
                              {isReel ? "🎬" : p.type === "CAROUSEL_ALBUM" ? "🖼️" : "📄"}
                            </div>
                          )}
                          <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-1 text-[9px] text-white tabular-nums text-right">
                            {t}
                          </div>
                        </div>
                        <div className={`text-[8px] px-1 py-0.5 border-t truncate text-center ${handle.color}`}>
                          {handle.short}
                        </div>
                      </button>
                    );
                  }
                  const p = it.post;
                  const dot = p.effectiveStatus === "publishing"
                    ? "bg-blue-500" : p.effectiveStatus === "failed" ? "bg-rose-500" : "bg-amber-400";
                  const handle = handleFor(p.publishToPage);
                  return (
                    <button
                      key={`sch-${p.id}`}
                      type="button"
                      onClick={() => onSelect?.(it)}
                      title={p.particulars || "(untitled)"}
                      className="block w-full text-left rounded-md overflow-hidden border border-amber-200 bg-amber-50 hover:border-amber-400 hover:shadow-md transition"
                    >
                      <div className="relative">
                        {p.thumbnailUrl ? (
                          <img src={p.thumbnailUrl} alt="" className="w-full aspect-[3/4] object-cover" />
                        ) : (
                          <div className="w-full aspect-[3/4] bg-amber-100 flex items-center justify-center text-lg text-amber-500">
                            {p.type?.toLowerCase().includes("reel") ? "🎬" :
                              p.type?.toLowerCase().includes("carousel") ? "🖼️" : "📄"}
                          </div>
                        )}
                        <div className={`absolute top-1 left-1 w-1.5 h-1.5 rounded-full ring-2 ring-white ${dot}`} />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-1 text-[9px] text-white tabular-nums text-right">
                          {t}
                        </div>
                      </div>
                      <div className={`text-[8px] px-1 py-0.5 border-t truncate text-center ${handle.color}`}>
                        {handle.short}
                      </div>
                    </button>
                  );
          })}
        </div>
      </div>
    </div>
  );
}

function LegacyQueueRow({ post }: { post: ScheduledPost }) {
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

// Instagram's in-app carousel allows 20 slides, but the Graph API this scheduler
// publishes through still caps carousels at 10 items — so 10 is the hard max here.
// (When Meta raises the API limit, bump this one constant.)
const MAX_MEDIA = 10;
function MediaUploader({ mediaUrls, setMediaUrls, locked }: { mediaUrls: string[]; setMediaUrls: (urls: string[]) => void; locked?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pasteVal, setPasteVal] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null); // read in onDrop (state closure would be stale)
  // The real media = non-empty urls. We render these as small thumbnails (not URL rows).
  const media = mediaUrls.map((u) => u.trim()).filter(Boolean);
  const isVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);
  const removeAt = (i: number) => { const nc = media.filter((_, j) => j !== i); setMediaUrls(nc.length ? nc : [""]); };
  const addPasted = () => { const v = pasteVal.trim(); if (!v) return; setMediaUrls([...media, v]); setPasteVal(""); };
  // Drag-to-reorder the carousel: move the dragged thumbnail into the drop slot.
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...media];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setMediaUrls(next.length ? next : [""]);
  };

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploading(true);
    try {
      // First, drop the trailing empty URL slot if it exists, so uploads append cleanly
      const base = mediaUrls.filter((u, i) => u.trim() || i === 0 && mediaUrls.length === 1 && !u);
      const filtered = base.length === 1 && !base[0].trim() ? [] : base.filter((u) => u.trim());
      const next = [...filtered];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_MEDIA) { setUploadError(`Max ${MAX_MEDIA} media items per post`); break; }
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
      {/* Big upload zone — shown only before any media is added (and never when locked) */}
      {!locked && media.length === 0 && (
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
              <div className="text-[11px] text-gray-500 mt-0.5">jpg · png · webp · gif · mp4 · mov · webm · up to 300 MB</div>
            </>
          )}
        </div>
      </label>
      )}

      {uploadError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {uploadError}</div>
      )}

      {/* Thumbnails fill the full box width; drag to reorder; + tile adds more. */}
      {media.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {media.map((url, i) => (
              <div key={url + i}
                draggable={!locked}
                onDragStart={locked ? undefined : () => { dragIdxRef.current = i; setDragIdx(i); }}
                onDragEnter={locked ? undefined : () => setOverIdx(i)}
                onDragOver={locked ? undefined : (e) => e.preventDefault()}
                onDrop={locked ? undefined : () => { const from = dragIdxRef.current; if (from !== null) reorder(from, i); dragIdxRef.current = null; setDragIdx(null); setOverIdx(null); }}
                onDragEnd={locked ? undefined : () => { dragIdxRef.current = null; setDragIdx(null); setOverIdx(null); }}
                title={locked ? undefined : "Drag to reorder"}
                className={`relative group w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border transition ${locked ? "cursor-default border-gray-200" : "cursor-grab active:cursor-grabbing"} ${!locked && overIdx === i && dragIdx !== i ? "border-brand ring-2 ring-brand" : "border-gray-200"} ${!locked && dragIdx === i ? "opacity-40" : ""}`}>
                {isVideo(url)
                  ? <video src={url} className="w-full h-full object-cover pointer-events-none" muted />
                  : <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.15"; }} />}
                <span className="absolute bottom-0 left-0 text-[9px] font-medium bg-black/55 text-white px-1 rounded-tr leading-tight">{i + 1}</span>
                {!locked && (
                  <button type="button" onClick={() => removeAt(i)} title="Remove"
                    className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black/55 text-white text-[11px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600">×</button>
                )}
              </div>
            ))}
            {!locked && media.length < MAX_MEDIA && (
              <label
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files); }}
                title="Add media"
                className={`w-16 h-16 flex-shrink-0 rounded-md border border-dashed flex items-center justify-center cursor-pointer transition ${dragOver ? "border-brand bg-brand-light/40 text-brand" : "border-gray-300 text-gray-400 hover:border-brand hover:text-brand"} ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files); e.target.value = ""; }} />
                {uploading ? <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <IconPlus size={20} stroke={2} />}
              </label>
            )}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{locked ? `🔒 ${media.length} original creative${media.length === 1 ? "" : "s"} — locked for repost` : `${media.length}/${MAX_MEDIA} · drag to reorder${media.length < MAX_MEDIA ? " · tap + to add more" : ""}`}</div>
        </div>
      )}

      {/* Paste a URL to add one more (Slack / Drive / direct link) */}
      {!locked && media.length < MAX_MEDIA && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">— or paste a URL —</div>
          <div className="flex gap-2">
            <input
              type="url"
              value={pasteVal}
              onChange={(e) => setPasteVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPasted(); } }}
              placeholder="https://… (image, video, reel, or Slack/Drive link)"
              className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2"
            />
            <button type="button" onClick={addPasted} disabled={!pasteVal.trim()}
              className="text-xs font-medium bg-brand text-white px-3 rounded-lg hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">Add</button>
          </div>
        </div>
      )}
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

// Textarea that grows to fit its content — so the full caption is always visible
// (no inner scrollbar). Height recomputes whenever the value changes (incl. autofill).
function AutoTextarea({ value, onChange, placeholder, className, minHeight = 96 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={className} style={{ overflow: "hidden", resize: "none", minHeight }} />
  );
}

// Hope-UI styled account picker — a custom popover (dot + label + subtitle, check on
// the selected row) instead of a native <select>, matching My Day's StatusDropdown.
const PAGE_DOT: Record<string, string> = {
  "GooCampus Main": "#8B5CF6", "GooCampus World": "#0EA5E9", "12Plus / GC India": "#10B981",
};
function PageDropdown({ value, onChange }: { value: PublishToPage; onChange: (v: PublishToPage) => void }) {
  const [open, setOpen] = useState(false);
  const current = PAGE_OPTIONS.find((o) => o.value === value) || PAGE_OPTIONS[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:border-gray-300 focus:outline-none focus:border-brand">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PAGE_DOT[current.value] || "#94A3B8" }} />
        <span className="flex-1 truncate text-gray-900">{current.label} <span className="text-gray-400">— {current.subtitle}</span></span>
        <IconChevronDown size={16} stroke={2} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-1 max-h-72 overflow-auto">
            {PAGE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 ${o.value === value ? "bg-brand-light/50" : "hover:bg-gray-50"}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PAGE_DOT[o.value] || "#94A3B8" }} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${o.value === value ? "font-medium text-gray-900" : "text-gray-700"}`}>{o.label}</span>
                  <span className="block text-[11px] text-gray-500 truncate">{o.subtitle}</span>
                </span>
                {o.value === value && <IconCheck size={16} stroke={2.5} className="text-brand flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Hope-UI date picker — native <input type="date"> renders the un-themeable OS
// calendar, so this is a custom popover styled to match the rest of the scheduler.
// value/onChange use the native "YYYY-MM-DD" string so all existing logic is unchanged.
function ymdStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function HopeDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();
  const [view, setView] = useState(() => { const b = selected || today; return { y: b.getFullYear(), m: b.getMonth() }; });
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const label = selected ? selected.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date";
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-gray-300 ${selected ? "text-gray-900" : "text-gray-400"}`}>
        <IconCalendarEvent size={16} stroke={1.8} className="text-gray-400" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-900">{monthLabel}</div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" onClick={() => setView((v) => { const m = v.m - 1; return m < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m }; })} className="p-1 rounded hover:bg-gray-100 text-gray-500"><IconChevronLeft size={16} stroke={2} /></button>
                <button type="button" aria-label="Next month" onClick={() => setView((v) => { const m = v.m + 1; return m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m }; })} className="p-1 rounded hover:bg-gray-100 text-gray-500"><IconChevronRight size={16} stroke={2} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-[10px] text-gray-400 text-center font-medium">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => d === null ? <div key={i} /> : (
                <button key={i} type="button" onClick={() => { onChange(ymdStr(d)); setOpen(false); }}
                  className={`h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-lg transition ${
                    selected && sameDay(d, selected) ? "bg-brand text-white font-medium"
                      : sameDay(d, today) ? "border border-brand text-brand"
                      : "text-gray-700 hover:bg-gray-100"}`}>
                  {d.getDate()}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs text-gray-500 hover:text-gray-800">Clear</button>
              <button type="button" onClick={() => { onChange(ymdStr(today)); setView({ y: today.getFullYear(), m: today.getMonth() }); setOpen(false); }} className="text-xs text-brand font-medium hover:underline">Today</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Hope-UI time picker — 15-min slots in a themed popover (12-hour labels). value is
// the native "HH:MM" 24h string so submit()'s date math is unchanged.
function to12h(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
function HopeTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 15, 30, 45]) slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector('[data-sel="1"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "center" });
    }
  }, [open]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-gray-300 ${value ? "text-gray-900" : "text-gray-400"}`}>
        <IconClock size={16} stroke={1.8} className="text-gray-400" />
        <span className="whitespace-nowrap">{value ? to12h(value) : "Time"}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div ref={listRef} className="absolute left-0 bottom-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-1 w-32 max-h-56 overflow-auto">
            {slots.map((s) => (
              <button key={s} type="button" data-sel={s === value ? "1" : undefined} onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left text-xs rounded-lg px-3 py-1.5 ${s === value ? "bg-brand-light/50 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                {to12h(s)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Hope-UI dropdown for simple {value,label} options (e.g. the account filter) —
// a themed popover instead of a native OS <select>.
function HopeSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:border-gray-300 text-gray-800">
        <span className="whitespace-nowrap">{current?.label}</span>
        <IconChevronDown size={14} stroke={2} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-1 min-w-[190px] max-h-72 overflow-auto">
            {options.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 text-left rounded-lg px-3 py-1.5 text-xs ${o.value === value ? "bg-brand-light/50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}>
                <span className="flex-1">{o.label}</span>
                {o.value === value && <IconCheck size={14} stroke={2.5} className="text-brand flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Official platform brand marks (the real trademark logos, not illustrated icons).
// Inline SVG so they render under the app's strict CSP with no external requests.
function InstagramLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Instagram">
      <defs>
        <radialGradient id="igGrad" cx="0.3" cy="1" r="1.25">
          <stop offset="0" stopColor="#FED576" />
          <stop offset="0.26" stopColor="#F47133" />
          <stop offset="0.61" stopColor="#BC3081" />
          <stop offset="1" stopColor="#4C63D2" />
        </radialGradient>
      </defs>
      <path fill="url(#igGrad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}
function FacebookLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Facebook">
      <path fill="#1877F2" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}
function LinkedInLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="LinkedIn">
      <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

// Live post preview, mocked per network. IG = square + handle; FB = text-above-media
// feed post; LinkedIn = professional post with a reaction bar. Caption binds live.
type PreviewPlatform = "instagram" | "facebook" | "linkedin";
function SocialPreview({ platform, handle, name, images, caption }: {
  platform: PreviewPlatform; handle: string; name: string; images: string[]; caption: string;
}) {
  const shell = "bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-sm mx-auto";
  const capNode = caption
    ? <span className="whitespace-pre-wrap">{caption.length > 220 ? caption.slice(0, 220) + "… more" : caption}</span>
    : <span className="text-gray-400 italic">Your caption will appear here</span>;
  // Carousel: swipe through every creative with the arrows. Reset to slide 1 when
  // the media list changes (e.g. switching tasks).
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [images.join("|")]);
  const safeIdx = images.length ? Math.min(idx, images.length - 1) : 0;
  const image = images[safeIdx] || null;
  const go = (delta: number) => setIdx((i) => (i + delta + images.length) % images.length);
  const arrowBtn = "absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center z-10";
  // Show the WHOLE creative — natural aspect, never cropped — with carousel controls.
  const media = (placeholderRatio: string) => (
    <div className={`relative overflow-hidden flex items-center justify-center ${image ? "bg-gray-50" : `${placeholderRatio} bg-gray-100 flex-col text-gray-300`}`}>
      {image
        ? <img src={image} alt="" className="w-full h-auto max-h-[520px] object-contain block" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        : <><div className="text-4xl mb-1">🖼️</div><div className="text-xs">Add media to preview</div></>}
      {images.length > 1 && (
        <>
          <button type="button" aria-label="Previous" onClick={() => go(-1)} className={`${arrowBtn} left-2`}><IconChevronLeft size={16} stroke={2.5} /></button>
          <button type="button" aria-label="Next" onClick={() => go(1)} className={`${arrowBtn} right-2`}><IconChevronRight size={16} stroke={2.5} /></button>
          <div className="absolute top-2 right-2 bg-black/55 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full z-10">{safeIdx + 1}/{images.length}</div>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {images.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === safeIdx ? "bg-white" : "bg-white/50"}`} />)}
          </div>
        </>
      )}
    </div>
  );

  if (platform === "facebook") {
    return (
      <div className={shell}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <FacebookLogo size={34} />
          <div className="leading-tight"><div className="text-sm font-semibold text-gray-900">{name}</div><div className="text-[11px] text-gray-500">Sponsored · 🌐</div></div>
          <div className="ml-auto text-gray-400">⋯</div>
        </div>
        <div className="px-3 pb-2 text-xs text-gray-800">{capNode}</div>
        {media("aspect-[4/5]")}
        <div className="flex items-center justify-around px-3 py-2 text-xs text-gray-600 border-t border-gray-100">
          <span>👍 Like</span><span>💬 Comment</span><span>↪ Share</span>
        </div>
      </div>
    );
  }
  if (platform === "linkedin") {
    return (
      <div className={shell}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <LinkedInLogo size={34} />
          <div className="leading-tight"><div className="text-sm font-semibold text-gray-900">{name}</div><div className="text-[11px] text-gray-500">Promoted · 🌐</div></div>
          <div className="ml-auto text-gray-400">⋯</div>
        </div>
        <div className="px-3 pb-2 text-xs text-gray-800">{capNode}</div>
        {media("aspect-[1.91/1]")}
        <div className="flex items-center justify-around px-3 py-2 text-xs text-gray-600 border-t border-gray-100">
          <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>➤ Send</span>
        </div>
      </div>
    );
  }
  // instagram
  return (
    <div className={shell}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <InstagramLogo size={28} />
        <div className="text-sm font-semibold text-gray-900">{handle}</div>
        <div className="ml-auto text-gray-400">⋯</div>
      </div>
      {media("aspect-[4/5]")}
      <div className="flex items-center gap-4 px-3 py-2 text-xl"><span>♡</span><span>💬</span><span>↗</span><span className="ml-auto">🔖</span></div>
      <div className="px-3 pb-3 text-xs"><span className="font-semibold mr-1.5">{handle}</span><span className="text-gray-800">{capNode}</span></div>
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
