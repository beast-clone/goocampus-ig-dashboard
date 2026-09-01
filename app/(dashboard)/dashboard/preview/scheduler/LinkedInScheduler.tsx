"use client";
import { useEffect, useState } from "react";
import MissingFieldsModal from "../MissingFieldsModal";
import {
  IconBrandLinkedin, IconCalendarClock, IconPhoto, IconTrash, IconExternalLink,
  IconCircleCheck, IconCircleDashed, IconAlertTriangle, IconClock, IconSend,
} from "@tabler/icons-react";

// Self-contained LinkedIn scheduler. Writes to its own queue (linkedin_scheduled_posts
// via /api/scheduler/linkedin); a cron worker (/api/cron/publish-linkedin) publishes
// due posts. Fully separate from the Meta/n8n pipeline.

type Page = { key: string; label: string };
const PAGES: Page[] = [
  { key: "goocampus", label: "GooCampus" },
  { key: "world", label: "GooCampus World" },
];

type Post = {
  id: string; pages: string[]; body: string; image_url: string | null;
  schedule_time: string; status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  results: { page: string; ok: boolean; permalink?: string | null; error?: string }[] | null;
  error: string | null; created_at: string; published_at: string | null;
};

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  catch { return iso; }
};

export function LinkedInScheduler() {
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [pages, setPages] = useState<string[]>(["goocampus"]);
  const [when, setWhen] = useState<"now" | "later">("later");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  const load = () => fetch("/api/scheduler/linkedin", { cache: "no-store" })
    .then((r) => r.json()).then((d) => setPosts(d.posts || [])).catch(() => setPosts([]));
  useEffect(() => { load(); }, []);
  // Poll while anything is pending so status flips to published live.
  useEffect(() => {
    if (!posts?.some((p) => p.status === "scheduled" || p.status === "publishing")) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [posts]);

  const [gate, setGate] = useState<string[] | null>(null);
  const togglePage = (k: string) => setPages((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);

  const submit = async () => {
    setMsg(null);
    // One consolidated list instead of four sequential one-liners — you used to fix
    // the page, hit Post, then be told about the date, then about the time.
    const missing = [
      !pages.length && "At least one page to post to",
      !body.trim() && !imageUrl.trim() && "Some text or an image",
      when === "later" && !date && "A date to publish on",
      when === "later" && !time && "A time to publish at",
    ].filter((x): x is string => !!x);
    if (missing.length) { setGate(missing); return; }
    let scheduleTimeISO: string | undefined;
    if (when === "later") {
      const dt = new Date(`${date}T${time}`);
      // These two aren't "missing" — they're wrong — so they stay as inline messages.
      if (isNaN(dt.getTime())) { setMsg({ ok: false, text: "Invalid date/time." }); return; }
      if (dt.getTime() < Date.now() - 60_000) { setMsg({ ok: false, text: "That time is in the past." }); return; }
      scheduleTimeISO = dt.toISOString();
    }
    setBusy(true);
    try {
      const res = await fetch("/api/scheduler/linkedin", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ pages, text: body.trim(), imageUrl: imageUrl.trim() || undefined, scheduleTimeISO }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg({ ok: true, text: when === "now" ? "Queued to publish now — it goes live on the next worker tick." : `Scheduled for ${fmt(scheduleTimeISO!)}.` });
      setBody(""); setImageUrl(""); setDate(""); setTime("");
      load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this scheduled post?")) return;
    await fetch(`/api/scheduler/linkedin?id=${id}`, { method: "DELETE", credentials: "same-origin" });
    load();
  };

  return (
    <div className="preview-scope grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Composer */}
      <div className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-light text-brand"><IconBrandLinkedin size={17} /></span>
          <div className="text-[15px] font-semibold text-[#232D42]">New LinkedIn post</div>
        </div>

        <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Pages</label>
        <div className="flex gap-2 mt-1.5 mb-4">
          {PAGES.map((p) => {
            const on = pages.includes(p.key);
            return (
              <button key={p.key} onClick={() => togglePage(p.key)}
                className={`text-[12.5px] font-medium rounded-lg px-3 py-1.5 border transition ${on ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-gray-300"}`}>
                {on ? "✓ " : ""}{p.label}
              </button>
            );
          })}
        </div>

        <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Post text</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7}
          placeholder="Write your LinkedIn post…"
          className="w-full mt-1.5 mb-4 rounded-xl border border-gray-200 focus:border-brand outline-none p-3 text-[13.5px] text-[#232D42] resize-y" />

        <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold flex items-center gap-1"><IconPhoto size={13} /> Image URL <span className="normal-case tracking-normal text-gray-400">(optional)</span></label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/image.jpg"
          className="w-full mt-1.5 mb-4 rounded-xl border border-gray-200 focus:border-brand outline-none p-2.5 text-[13px] text-[#232D42]" />

        <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">When</label>
        <div className="flex gap-2 mt-1.5 mb-3">
          {(["later", "now"] as const).map((w) => (
            <button key={w} onClick={() => setWhen(w)}
              className={`text-[12.5px] font-medium rounded-lg px-3 py-1.5 border inline-flex items-center gap-1.5 transition ${when === w ? "bg-brand-light text-brand-dark border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-gray-300"}`}>
              {w === "later" ? <IconCalendarClock size={14} /> : <IconSend size={14} />}{w === "later" ? "Schedule" : "Publish now"}
            </button>
          ))}
        </div>
        {when === "later" && (
          <div className="flex gap-2 mb-4">
            <input type="date" value={date} min={new Date().toLocaleDateString("en-CA")}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
          </div>
        )}

        {msg && <div className={`text-[12.5px] rounded-lg px-3 py-2 mb-3 ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>{msg.text}</div>}

        <button onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2.5 hover:bg-brand-dark disabled:opacity-50 transition">
          {when === "later" ? <IconCalendarClock size={15} /> : <IconSend size={15} />} {busy ? "Saving…" : when === "later" ? "Schedule post" : "Publish now"}
        </button>
      </div>

      {/* Queue */}
      <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-5">
        <div className="text-[13.5px] font-semibold text-[#232D42] mb-3">Scheduled &amp; posted</div>
        {!posts ? <div className="animate-pulse h-32 bg-gray-100 rounded-xl" /> :
          posts.length === 0 ? <div className="text-[13px] text-gray-400 py-6 text-center">Nothing scheduled yet.</div> : (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {posts.map((p) => <QueueRow key={p.id} p={p} onCancel={cancel} />)}
          </div>
        )}
      </div>

      {gate && <MissingFieldsModal gate="schedule" missing={gate} onClose={() => setGate(null)} />}
    </div>
  );
}

function StatusPill({ s }: { s: Post["status"] }) {
  const map = {
    published: { c: "bg-emerald-50 text-emerald-700", i: <IconCircleCheck size={12} />, t: "Published" },
    scheduled: { c: "bg-amber-50 text-amber-700", i: <IconClock size={12} />, t: "Scheduled" },
    publishing: { c: "bg-blue-50 text-blue-700", i: <IconCircleDashed size={12} className="animate-spin" />, t: "Publishing" },
    failed: { c: "bg-rose-50 text-rose-700", i: <IconAlertTriangle size={12} />, t: "Failed" },
    canceled: { c: "bg-gray-100 text-gray-500", i: <IconTrash size={12} />, t: "Canceled" },
  }[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.c}`}>{map.i} {map.t}</span>;
}

function QueueRow({ p, onCancel }: { p: Post; onCancel: (id: string) => void }) {
  const pageLabels = p.pages.map((k) => (k === "world" ? "World" : "GooCampus")).join(" · ");
  const links = (p.results || []).filter((r) => r.ok && r.permalink);
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <StatusPill s={p.status} />
        <span className="text-[11px] text-gray-400">{pageLabels}</span>
        {p.status === "scheduled" && (
          <button onClick={() => onCancel(p.id)} className="ml-auto text-gray-300 hover:text-rose-500" title="Cancel"><IconTrash size={14} /></button>
        )}
      </div>
      <div className="text-[12.5px] text-[#232D42] line-clamp-2 mb-1">{p.body || <span className="text-gray-400 italic">image only</span>}</div>
      <div className="text-[11px] text-gray-400">{p.status === "published" && p.published_at ? `Posted ${fmt(p.published_at)}` : fmt(p.schedule_time)}</div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-3 mt-1.5">
          {links.map((r, i) => (
            <a key={i} href={r.permalink!} target="_blank" rel="noreferrer" className="text-[11.5px] text-brand hover:underline inline-flex items-center gap-0.5">
              <IconExternalLink size={11} /> {r.page === "world" ? "World" : "GooCampus"}
            </a>
          ))}
        </div>
      )}
      {p.status === "failed" && p.error && <div className="text-[11px] text-rose-600 mt-1">{p.error}</div>}
    </div>
  );
}
