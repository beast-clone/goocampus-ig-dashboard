"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { CreativeThumb } from "@/components/CreativeThumb";
import { fmtDate } from "@/lib/date";
import MissingFieldsModal, { gateFromResponse, type GateBlock } from "../MissingFieldsModal";
import {
  IconChecklist, IconRefresh, IconCalendarPlus, IconArrowBackUp,
  IconClipboardCheck, IconLayoutGrid, IconTable, IconX, IconChevronLeft, IconChevronRight,
} from "@tabler/icons-react";

// A media URL is a video if its extension says so (fall back to the post type when
// the URL carries no extension, e.g. a signed storage link for a reel).
function isVideoUrl(u: string | undefined, type: string | null): boolean {
  if (u && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) return true;
  if (u) return false;
  return /reel|video/i.test(type || "");
}

// "Content Review" — the human gate between production and scheduling. A post lands
// here the moment it's marked "Output - Ready". The social-media reviewer approves it
// (Push to Schedule -> "Ready to Publish", which is what the Scheduler picks up) or
// bounces it (Send back -> "Incorporating Feedback"). Nothing reaches the Scheduler
// until it's pushed from here, so a not-final output never has to be pulled back out.

type ReviewPost = {
  id: string; title: string; status: string; sbu: string | null; type: string | null;
  owner: string | null; caption: string | null; content: string | null;
  mediaUrls: string[]; assetLink: string | null; thumbnailUrl: string | null;
  hasCreative: boolean; publishingDate: string | null; updatedAt: string | null;
};


function typeChip(t: string | null) {
  const s = (t || "").toLowerCase();
  if (s.includes("reel")) return { bg: "#FBEAF0", fg: "#993556" };
  if (s.includes("carousel")) return { bg: "#E9ECFB", fg: "#3A57E8" };
  if (s.includes("youtube")) return { bg: "#FDE8E8", fg: "#B01919" };
  if (s.includes("story")) return { bg: "#E4F4FD", fg: "#0B6EA8" };
  return { bg: "#E6F1FF", fg: "#2B6AB0" };
}

export default function ContentReviewPage() {
  return (
    <PreviewDashboardShell
      active="content-review"
      title="Content Review"
      subtitle="Produced content awaiting a final check before it can be scheduled."
      hideAccountPicker
      hideRange
    >
      {() => <Review />}
    </PreviewDashboardShell>
  );
}

function Review() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Completeness gate (422) — the itemized popup, shared with My Day / the hub.
  const [gate, setGate] = useState<GateBlock | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null); // post id being sent back with notes
  const [feedbackText, setFeedbackText] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [openPost, setOpenPost] = useState<ReviewPost | null>(null); // preview modal
  const [slide, setSlide] = useState(0); // carousel page index in the preview

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/content-review", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPosts((d.posts as ReviewPost[]) || []);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSlide(0); }, [openPost]); // reset carousel page each time a post opens
  // Esc closes the preview modal.
  useEffect(() => {
    if (!openPost) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenPost(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPost]);

  // Move a post to a new status via the whitelisted update API, then drop it from the
  // queue. Surfaces the server error instead of failing silently (an approval that
  // didn't actually persist must never look like it succeeded).
  async function move(id: string, status: string, label: string, feedback?: string, title?: string) {
    setBusyId(id);
    setErr(null);
    try {
      const fields: Record<string, unknown> = { status };
      // Send-back carries Manya's notes into custom.incorporating_feedback (spec §7)
      // so the producer sees them highlighted on their My Day task.
      if (feedback && feedback.trim()) fields.custom = { incorporating_feedback: feedback.trim() };
      const res = await fetch("/api/marketing-hub/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, fields }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 422 = a completeness gate. The server already listed exactly what's
        // missing; show that list instead of collapsing it to one line of banner.
        const block = gateFromResponse(res.status, d, title || "This post");
        if (block) { setGate(block); return; }
        throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
      }
      setPosts((p) => p.filter((x) => x.id !== id));
      setFeedbackFor(null);
      setFeedbackText("");
      setOpenPost(null); // the post left the queue — close its preview if open
    } catch (e) {
      setErr(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  // Samvaya / other-platform work is a SEPARATE business — it must never sit mixed
  // into the GooCampus review queue (same rule as the My Day timeline). Split it out
  // by interest (SBU) and give it its own clearly-labelled section below.
  const isSamvaya = (p: ReviewPost) => /samvaya|matrimony/i.test(p.sbu || "");
  const mainPosts = posts.filter((p) => !isSamvaya(p));
  const samvayaPosts = posts.filter(isSamvaya);

  const renderRow = (p: ReviewPost) => {
    const tc = typeChip(p.type);
    const busy = busyId === p.id;
    return (
      <Fragment key={p.id}>
        <tr onClick={() => setOpenPost(p)} className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer">
          <td className="px-4 py-2.5">
            <span className="inline-flex text-[11px] font-semibold rounded-md px-2 py-0.5" style={{ background: tc.bg, color: tc.fg }}>{p.type || "Post"}</span>
          </td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-md bg-[#F6F7FB] overflow-hidden flex-shrink-0 relative">
                <CreativeThumb thumbnailUrl={p.thumbnailUrl} assetLink={p.assetLink} type={p.type} title={p.title} seed={p.id} />
              </span>
              <span className="text-[#232D42] font-medium max-w-[380px] truncate">{p.title || "Untitled"}</span>
            </div>
          </td>
          <td className="px-4 py-2.5">
            {p.sbu ? <span className="inline-flex text-[11px] font-semibold rounded-full px-2.5 py-1 bg-brand-light text-[#2138B0]">{p.sbu}</span> : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-4 py-2.5">
            {p.hasCreative ? <span className="text-emerald-700 text-xs font-medium">✓ Attached</span> : <span className="text-amber-700 text-xs bg-amber-50 rounded-md px-2 py-0.5">No creative</span>}
          </td>
          <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 justify-end">
              <button disabled={busy} onClick={() => move(p.id, "Ready to Publish", "Push to Schedule", undefined, p.title)} title="Approve and send to the Scheduler" className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand rounded-lg px-3 py-1.5 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed">
                <IconCalendarPlus size={14} stroke={1.9} /> Push to Schedule
              </button>
              <button disabled={busy} onClick={() => { setFeedbackFor(feedbackFor === p.id ? null : p.id); setFeedbackText(""); }} className="flex items-center gap-1.5 text-xs font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand hover:text-brand disabled:opacity-40">
                <IconArrowBackUp size={14} stroke={1.9} /> Send back
              </button>
            </div>
          </td>
        </tr>
        {feedbackFor === p.id && (
          <tr className="bg-rose-50/40 border-b border-gray-50">
            <td colSpan={5} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <input autoFocus value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="What needs changing? (the producer sees this on their task)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <button disabled={busy || !feedbackText.trim()} onClick={() => move(p.id, "Incorporating Feedback", "Send back", feedbackText, p.title)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#C0201F] rounded-lg px-3 py-2 hover:bg-[#9E1A19] disabled:opacity-40 whitespace-nowrap">
                  <IconArrowBackUp size={15} stroke={1.9} /> Send back with feedback
                </button>
                <button onClick={() => { setFeedbackFor(null); setFeedbackText(""); }} className="text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand">Cancel</button>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderCard = (p: ReviewPost) => {
    const tc = typeChip(p.type);
    const busy = busyId === p.id;
    return (
      <div
        key={p.id}
        onClick={() => setOpenPost(p)}
        className="rounded-xl border border-gray-100 bg-white overflow-hidden flex flex-col cursor-pointer"
      >
        {/* Media preview */}
        <div className="aspect-[4/3] bg-[#F6F7FB] relative overflow-hidden">
          <CreativeThumb thumbnailUrl={p.thumbnailUrl} assetLink={p.assetLink} type={p.type} title={p.title} seed={p.id} />
          <span
            className="absolute top-2 left-2 text-[11px] font-semibold rounded-md px-2 py-0.5"
            style={{ background: tc.bg, color: tc.fg }}
          >
            {p.type || "Post"}
          </span>
        </div>

        {/* Body */}
        <div className="p-3.5 flex flex-col gap-2 flex-1">
          <div className="text-sm font-medium text-[#232D42] leading-snug line-clamp-2">
            {p.title || "Untitled"}
          </div>
          {p.sbu && (
            <div>
              <span className="inline-flex items-center text-[11px] font-semibold rounded-full px-2.5 py-1 bg-brand-light text-[#2138B0]">
                {p.sbu}
              </span>
            </div>
          )}
          {(p.caption || p.content) && (
            <p className="text-xs text-[#8A92A6] line-clamp-2">{p.caption || p.content}</p>
          )}
          {!p.hasCreative && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1">
              No creative attached — add media before scheduling.
            </div>
          )}

          {/* Actions */}
          {feedbackFor === p.id ? (
            /* Send-back needs feedback notes (spec §7) — they land highlighted
               on the producer's My Day task. */
            <div className="mt-auto pt-1 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                autoFocus
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What needs changing? (the producer sees this on their task)"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  disabled={busy || !feedbackText.trim()}
                  onClick={() => move(p.id, "Incorporating Feedback", "Send back", feedbackText, p.title)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#C0201F] rounded-lg px-3 py-2 hover:bg-[#9E1A19] disabled:opacity-40"
                >
                  <IconArrowBackUp size={15} stroke={1.9} /> Send back with feedback
                </button>
                <button onClick={() => { setFeedbackFor(null); setFeedbackText(""); }} className="text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-auto pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                disabled={busy}
                onClick={() => move(p.id, "Ready to Publish", "Push to Schedule", undefined, p.title)}
                title="Approve and send to the Scheduler"
                className="flex-1 whitespace-nowrap flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-brand rounded-lg px-2.5 py-2 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <IconCalendarPlus size={15} stroke={1.9} className="flex-shrink-0" /> Push to Schedule
              </button>
              <button
                disabled={busy}
                onClick={() => { setFeedbackFor(p.id); setFeedbackText(""); }}
                title="Send back to the producer with feedback"
                className="whitespace-nowrap flex items-center justify-center gap-1.5 text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-2.5 py-2 hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <IconArrowBackUp size={15} stroke={1.9} /> Send back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTable = (list: ReviewPost[]) => (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="bg-gray-50 border-b border-gray-100 text-[#8A92A6] text-left">
          <tr>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Post</th>
            <th className="px-4 py-2.5 font-medium">Interest</th>
            <th className="px-4 py-2.5 font-medium">Creative</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>{list.map(renderRow)}</tbody>
      </table>
    </div>
  );

  // Grid scales up on big monitors: 5 cols on ~24in (1536px+), 6 on ~27-32in (2100px+).
  const renderGrid = (list: ReviewPost[]) => (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
      {list.map(renderCard)}
    </div>
  );

  return (
    <div>
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 mb-5 rounded-xl bg-brand-light px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand text-white">
            <IconChecklist size={18} stroke={1.8} />
          </span>
          <div>
            <div className="text-[#232D42] font-semibold text-sm">Ready for review</div>
            <div className="text-xs text-[#8A92A6]">
              Approve to send to the Scheduler, or send back for changes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Cards / Table view toggle */}
          <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setView("cards")}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-md transition ${view === "cards" ? "bg-brand text-white" : "text-[#4A5468] hover:text-brand"}`}
            >
              <IconLayoutGrid size={15} stroke={1.8} /> Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-md transition ${view === "table" ? "bg-brand text-white" : "text-[#4A5468] hover:text-brand"}`}
            >
              <IconTable size={15} stroke={1.8} /> Table
            </button>
          </div>
          <span className="text-sm font-medium text-brand bg-white rounded-full px-3 py-1">
            {mainPosts.length} in queue
          </span>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm font-medium text-[#4A5468] hover:text-brand border border-gray-200 bg-white rounded-lg px-3 py-1.5"
          >
            <IconRefresh size={15} stroke={1.8} /> Refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm px-4 py-2.5">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#8A92A6] py-16 text-center">Loading review queue…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-light grid place-items-center mb-3">
            <IconClipboardCheck size={22} className="text-brand" stroke={1.8} />
          </div>
          <div className="text-[#232D42] font-medium">Nothing to review</div>
          <div className="text-sm text-[#8A92A6] mt-1">
            Posts appear here the moment they&apos;re marked <b>Output&nbsp;-&nbsp;Ready</b>.
          </div>
        </div>
      ) : (
        <>
          {/* GooCampus review queue */}
          {mainPosts.length > 0 ? (
            view === "table" ? renderTable(mainPosts) : renderGrid(mainPosts)
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white py-10 text-center text-sm text-[#8A92A6]">
              No GooCampus posts awaiting review.
            </div>
          )}

          {/* Samvaya / other-platform work — a separate business, sorted out of the
              GooCampus queue so it's never mixed in (same rule as the My Day timeline). */}
          {samvayaPosts.length > 0 && (
            <section className="mt-7">
              <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                <span className="grid place-items-center w-8 h-8 rounded-lg text-white" style={{ background: "#0E8E86" }}>
                  <IconChecklist size={16} stroke={1.8} />
                </span>
                <div>
                  <div className="text-[#232D42] font-semibold text-sm">Samvaya · other platforms</div>
                  <div className="text-xs text-[#8A92A6]">Separate from GooCampus — reviewed and scheduled on its own.</div>
                </div>
                <span className="ml-auto text-xs font-medium rounded-full px-3 py-1" style={{ background: "#DEF3F1", color: "#0E8E86" }}>
                  {samvayaPosts.length} in queue
                </span>
              </div>
              {view === "table" ? renderTable(samvayaPosts) : renderGrid(samvayaPosts)}
            </section>
          )}
        </>
      )}

      {/* Preview popup — click any post (card or table row) to open it. */}
      {openPost && (() => {
        const p = openPost;
        const tc = typeChip(p.type);
        const busy = busyId === p.id;
        // Standard IG dimensions: reel/story = 9:16 (1080×1920), else 4:5 (1080×1350).
        // The modal width hugs the (portrait) creative so the media fills it edge-to-edge
        // with no side gaps, while staying a sensible height.
        const portrait = /reel|story/i.test(p.type || "");
        const media = p.mediaUrls || [];
        const cur = media[slide];
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpenPost(null)}>
            <div className="bg-white rounded-2xl w-full max-h-[92vh] flex flex-col overflow-hidden" style={{ maxWidth: portrait ? 384 : 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold rounded-md px-2 py-0.5" style={{ background: tc.bg, color: tc.fg }}>{p.type || "Post"}</span>
                    {p.sbu && <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-brand-light text-[#2138B0]">{p.sbu}</span>}
                  </div>
                  <h2 className="text-lg font-semibold text-[#232D42] leading-snug">{p.title || "Untitled"}</h2>
                </div>
                <button onClick={() => setOpenPost(null)} className="text-gray-400 hover:text-gray-700 flex-shrink-0"><IconX size={20} /></button>
              </div>
              <div className="overflow-y-auto p-5 flex flex-col gap-4">
                <div className={`w-full ${portrait ? "aspect-[9/16]" : "aspect-[4/5]"} relative rounded-xl overflow-hidden bg-[#0b1020]`}>
                  {media.length > 0 ? (
                    isVideoUrl(cur, p.type) ? (
                      <video key={cur} src={cur} controls autoPlay muted loop playsInline className="w-full h-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cur} alt={p.title || "creative"} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <CreativeThumb thumbnailUrl={p.thumbnailUrl} assetLink={p.assetLink} type={p.type} title={p.title} seed={p.id} />
                  )}
                  {media.length > 1 && (
                    <>
                      <button aria-label="Previous" onClick={(e) => { e.stopPropagation(); setSlide((s) => (s - 1 + media.length) % media.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white transition"><IconChevronLeft size={20} stroke={2} /></button>
                      <button aria-label="Next" onClick={(e) => { e.stopPropagation(); setSlide((s) => (s + 1) % media.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white transition"><IconChevronRight size={20} stroke={2} /></button>
                      <div className="absolute top-2 right-2 text-[11px] font-medium text-white bg-black/45 rounded-full px-2 py-0.5">{slide + 1}/{media.length}</div>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                        {media.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full transition ${i === slide ? "bg-white" : "bg-white/40"}`} />)}
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-0.5">Interest</div><div className="text-sm text-[#232D42]">{p.sbu || "—"}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-0.5">Owner</div><div className="text-sm text-[#232D42] capitalize">{p.owner || "—"}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-0.5">Publishing</div><div className="text-sm text-[#232D42]">{p.publishingDate ? fmtDate(p.publishingDate) : "—"}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-0.5">Creative</div><div className="text-sm text-[#232D42]">{p.hasCreative ? "Attached" : "None yet"}</div></div>
                </div>
                {(p.caption || p.content) && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A92A6] mb-1">Caption</div>
                    <p className="text-sm text-[#232D42] whitespace-pre-wrap">{p.caption || p.content}</p>
                  </div>
                )}
                {!p.hasCreative && <div className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">No creative attached — add media before it can go to the Scheduler.</div>}
              </div>
              <div className="px-5 py-4 border-t border-gray-100">
                {feedbackFor === p.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea autoFocus value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="What needs changing? (the producer sees this on their task)" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                    <div className="flex items-center gap-2">
                      <button disabled={busy || !feedbackText.trim()} onClick={() => move(p.id, "Incorporating Feedback", "Send back", feedbackText, p.title)} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#C0201F] rounded-lg px-3 py-2 hover:bg-[#9E1A19] disabled:opacity-40"><IconArrowBackUp size={15} stroke={1.9} /> Send back with feedback</button>
                      <button onClick={() => { setFeedbackFor(null); setFeedbackText(""); }} className="text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button disabled={busy} onClick={() => move(p.id, "Ready to Publish", "Push to Schedule", undefined, p.title)} title="Approve and send to the Scheduler" className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-brand rounded-lg px-3 py-2.5 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed"><IconCalendarPlus size={15} stroke={1.9} /> Push to Schedule</button>
                    <button disabled={busy} onClick={() => { setFeedbackFor(p.id); setFeedbackText(""); }} className="flex items-center justify-center gap-1.5 text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-4 py-2.5 hover:border-brand hover:text-brand disabled:opacity-40"><IconArrowBackUp size={15} stroke={1.9} /> Send back</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {gate && <MissingFieldsModal {...gate} onClose={() => setGate(null)} />}
    </div>
  );
}
