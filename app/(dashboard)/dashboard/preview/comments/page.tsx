"use client";
import { useMemo, useState } from "react";
import { IconMessageCircle, IconCheck, IconArrowBackUp, IconExternalLink } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useApi } from "@/lib/use-api";

// Every note left with the bottom-right Comment button, from everyone, in one list.
// The pins themselves only live in the commenter's own browser; this reads the
// server-side copy each comment also writes (lib/comments.ts). Admin only.

type Comment = { id: string; path: string; text: string; author: string; ts: number; resolved?: boolean; resolvedBy?: string; resolvedAt?: number };
type Filter = "open" | "resolved" | "all";

// "/dashboard/preview/marketing-hub?tab=master" → "Marketing hub · master"
function pageLabel(path: string): string {
  const [p, q] = path.split("?");
  const seg = p.replace(/^\/dashboard\/preview\/?/, "").split("/").filter(Boolean);
  const name = seg.length ? seg.map((s) => s.replace(/-/g, " ")).join(" › ") : "overview";
  const tab = q ? new URLSearchParams(q).get("tab") : null;
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return tab ? `${label} · ${tab}` : label;
}
const when = (ts: number) => new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function CommentsPage() {
  return (
    <PreviewDashboardShell active="comments" title="Comments" subtitle="Every note the team leaves with the Comment button — newest first." hideAccountPicker hideRange>
      {() => <CommentsList />}
    </PreviewDashboardShell>
  );
}

function CommentsList() {
  const { data, error, isLoading, mutate } = useApi<{ comments: Comment[] }>("/api/comments");
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const all = useMemo(() => data?.comments || [], [data]);
  const counts = { open: all.filter((c) => !c.resolved).length, resolved: all.filter((c) => c.resolved).length, all: all.length };
  const shown = all.filter((c) => (filter === "all" ? true : filter === "open" ? !c.resolved : !!c.resolved));

  const setResolved = async (c: Comment, resolved: boolean) => {
    setBusy(c.id); setFailed(null);
    try {
      const r = await fetch("/api/comments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, resolved }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setFailed(j.error || "Couldn't update that comment."); return; }
      await mutate();
    } finally { setBusy(null); }
  };

  return (
    <div className="preview-scope bg-white border border-gray-100 rounded-xl">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <IconMessageCircle size={20} stroke={1.8} className="text-brand" />
        <div className="text-[16px] font-medium text-[#232D42]">Team comments</div>
        <div className="ml-auto inline-flex bg-[#F6F7FB] border border-gray-100 rounded p-0.5 gap-0.5">
          {(["open", "resolved", "all"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-9 px-3 rounded text-[14px] font-medium transition ${filter === f ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
              {f === "open" ? "Open" : f === "resolved" ? "Resolved" : "All"} <span className="text-[12px] text-[#8A92A6]">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {failed && <div className="mx-4 mt-3 rounded bg-[#FDECEA] text-[#8a2e28] text-[14px] px-3 py-2">{failed}</div>}

      {error ? (
        <div className="px-4 py-10 text-center text-[14px] text-rose-600">Couldn&apos;t load comments: {error.message}</div>
      ) : isLoading && !data ? (
        <LoadingBlock />
      ) : shown.length === 0 ? (
        <div className="px-4 py-10 text-center text-[14px] text-[#8A92A6]">
          {filter === "open" ? "No open comments — everything's been handled." : filter === "resolved" ? "Nothing resolved yet." : "No comments yet."}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {shown.map((c) => (
            <div key={c.id} className={`flex items-start gap-4 px-4 py-3 ${c.resolved ? "bg-[#F6F7FB]/60" : ""}`}>
              <span className="w-9 h-9 rounded-full bg-[#E9ECFB] text-[#3A57E8] flex items-center justify-center text-[14px] font-medium flex-shrink-0">
                {(c.author || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#8A92A6]">
                  <span className="text-[14px] font-medium text-[#232D42]">{c.author || "Someone"}</span>
                  <span>{when(c.ts)}</span>
                  <span>·</span>
                  <a href={c.path} className="inline-flex items-center gap-1 text-brand hover:underline">{pageLabel(c.path)}<IconExternalLink size={12} stroke={1.8} /></a>
                </div>
                <div className={`text-[14px] mt-1 whitespace-pre-wrap ${c.resolved ? "text-[#8A92A6]" : "text-[#232D42]"}`}>{c.text}</div>
                {c.resolved && c.resolvedAt && (
                  <div className="text-[12px] text-[#2F9E6F] mt-1">Resolved {when(c.resolvedAt)}{c.resolvedBy ? ` by ${c.resolvedBy.charAt(0).toUpperCase()}${c.resolvedBy.slice(1)}` : ""}</div>
                )}
              </div>
              {c.resolved ? (
                <button onClick={() => setResolved(c, false)} disabled={busy === c.id}
                  className="h-9 px-3 rounded border border-gray-200 text-[14px] text-[#4A5468] inline-flex items-center gap-1.5 hover:border-[#3A57E8] disabled:opacity-50 flex-shrink-0">
                  <IconArrowBackUp size={16} stroke={1.8} />Reopen
                </button>
              ) : (
                <button onClick={() => setResolved(c, true)} disabled={busy === c.id}
                  className="h-9 px-3 rounded bg-brand text-white text-[14px] font-medium inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50 flex-shrink-0">
                  <IconCheck size={16} stroke={2} />{busy === c.id ? "Saving…" : "Mark resolved"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
