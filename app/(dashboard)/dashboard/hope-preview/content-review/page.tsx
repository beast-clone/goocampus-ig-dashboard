"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { CreativeThumb } from "@/components/CreativeThumb";
import {
  IconChecklist, IconRefresh, IconCalendarPlus, IconArrowBackUp,
  IconClipboardCheck, IconLayoutGrid, IconTable,
} from "@tabler/icons-react";

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
    <HopeDashboardShell
      active="content-review"
      title="Content Review"
      subtitle="Produced content awaiting a final check before it can be scheduled."
      hideAccountPicker
      hideRange
    >
      {() => <Review />}
    </HopeDashboardShell>
  );
}

function Review() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null); // post id being sent back with notes
  const [feedbackText, setFeedbackText] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");

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

  // Move a post to a new status via the whitelisted update API, then drop it from the
  // queue. Surfaces the server error instead of failing silently (an approval that
  // didn't actually persist must never look like it succeeded).
  async function move(id: string, status: string, label: string, feedback?: string) {
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
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setPosts((p) => p.filter((x) => x.id !== id));
      setFeedbackFor(null);
      setFeedbackText("");
    } catch (e) {
      setErr(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

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
            {posts.length} in queue
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
      ) : view === "table" ? (
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
            <tbody>
              {posts.map((p) => {
                const tc = typeChip(p.type);
                const busy = busyId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50/60">
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
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          <button disabled={busy || !p.hasCreative} onClick={() => move(p.id, "Ready to Publish", "Push to Schedule")} title={p.hasCreative ? "Approve and send to the Scheduler" : "Add a creative first"} className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand rounded-lg px-3 py-1.5 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed">
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
                            <button disabled={busy || !feedbackText.trim()} onClick={() => move(p.id, "Incorporating Feedback", "Send back", feedbackText)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#C0201F] rounded-lg px-3 py-2 hover:bg-[#9E1A19] disabled:opacity-40 whitespace-nowrap">
                              <IconArrowBackUp size={15} stroke={1.9} /> Send back with feedback
                            </button>
                            <button onClick={() => { setFeedbackFor(null); setFeedbackText(""); }} className="text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
          {/* Grid scales up on big monitors: 5 cols on ~24in (1536px+), 6 on ~27-32in (2100px+), so cards shrink and 5-6 fit per row. */}
          {posts.map((p) => {
            const tc = typeChip(p.type);
            const busy = busyId === p.id;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-gray-100 bg-white overflow-hidden flex flex-col"
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
                    <div className="mt-auto pt-1 flex flex-col gap-2">
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
                          onClick={() => move(p.id, "Incorporating Feedback", "Send back", feedbackText)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#C0201F] rounded-lg px-3 py-2 hover:bg-[#9E1A19] disabled:opacity-40"
                        >
                          <IconArrowBackUp size={15} stroke={1.9} /> Send back with feedback
                        </button>
                        <button onClick={() => { setFeedbackFor(null); setFeedbackText(""); }} className="text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-auto pt-1">
                      <button
                        disabled={busy || !p.hasCreative}
                        onClick={() => move(p.id, "Ready to Publish", "Push to Schedule")}
                        title={p.hasCreative ? "Approve and send to the Scheduler" : "Add a creative first"}
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-brand rounded-lg px-3 py-2 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <IconCalendarPlus size={15} stroke={1.9} /> Push to Schedule
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => { setFeedbackFor(p.id); setFeedbackText(""); }}
                        title="Send back to the producer with feedback"
                        className="flex items-center justify-center gap-1.5 text-sm font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-2 hover:border-brand hover:text-brand disabled:opacity-40"
                      >
                        <IconArrowBackUp size={15} stroke={1.9} /> Send back
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
