"use client";
import { useEffect, useMemo, useState } from "react";
import {
  IconPlus, IconRefresh, IconPencil, IconTrash, IconPlayerPause, IconPlayerPlay, IconExternalLink,
  IconMail, IconBrandTelegram, IconEye, IconNews, IconX, IconCheck, IconAlertTriangle, IconFileTypePdf, IconWorld, IconSparkles,
} from "@tabler/icons-react";
import { useApi } from "@/lib/use-api";
import { LoadingBlock } from "@/components/LoadingBlock";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";

type Watcher = {
  id: string; name: string | null; url: string; category: string | null; auto_category: boolean;
  emails: string[]; telegram: boolean; telegram_chats: string[]; active: boolean;
  created_at: string; last_checked_at: string | null; last_error: string | null; last_count: number | null;
};
type Item = { id: string; watcher_id: string; item_url: string; title: string | null; grp: string | null; baseline: boolean; detected_at: string; posted_at: string | null; summary: string | null; summary_from: string | null; emailed_at: string | null; telegram_at: string | null };
type Chat = { chat_id: string; name: string; username: string | null; kind: string };
type Recipients = { team: { email: string; name: string }[]; others: string[]; chats: Chat[]; email: boolean; telegram: boolean; bot: string | null };

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const label = (w: Watcher) => w.name || host(w.url);
function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
// The IST calendar day of a timestamp, as yyyy-mm-dd — for Today / Yesterday sections.
const dayOf = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);
function dayLabel(day: string): string {
  if (day === dayOf(Date.now())) return "Today";
  if (day === dayOf(Date.now() - 86_400_000)) return "Yesterday";
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
// When a notice is from: its own date if it carries one, else when we found it.
const stamp = (i: Item) => Date.parse(i.posted_at || i.detected_at);
// "New" = found by a check after the first one, within the last day.
const isNew = (i: Item) => !i.baseline && Date.now() - Date.parse(i.detected_at) < 86_400_000;
// UG / PG get the same two colours everywhere; any other group is neutral.
const GROUP_CLS: Record<string, string> = { UG: "bg-brand-light text-brand", PG: "bg-amber-50 text-amber-800", "UG & PG": "bg-[#EEF7F1] text-[#1E7B4C]" };
const groupCls = (g: string) => GROUP_CLS[g] || "bg-gray-100 text-[#4A5468]";
const isPdf = (u: string) => /\.pdf(\?|$)/i.test(u);

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export function WatchersWorkspace() {
  const { data: wd, isLoading: wLoading, refresh: refreshWatchers } = useApi<{ watchers: Watcher[] }>("/api/watchers");
  const { data: rec, refresh: refreshRec } = useApi<Recipients>("/api/watchers/recipients");
  const watchers = useMemo(() => wd?.watchers || [], [wd]);

  const [group, setGroup] = useState("all");
  const [site, setSite] = useState("all");
  const [days, setDays] = useState("30");
  const [showAll, setShowAll] = useState(false);
  const qs = new URLSearchParams();
  if (group !== "all") qs.set("group", group);
  if (site !== "all") qs.set("watcher", site);
  if (days !== "0") qs.set("days", days);
  if (showAll) qs.set("all", "1");
  const { data: id, isLoading: iLoading, refresh: refreshItems } = useApi<{ items: Item[] }>(`/api/watchers/items?${qs}`);
  const items = useMemo(() => id?.items || [], [id]);

  // A notification links here with ?w=<id>: open on that website's news.
  useEffect(() => { const w = new URLSearchParams(window.location.search).get("w"); if (w) setSite(w); }, []);

  const [editing, setEditing] = useState<Watcher | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Live state of a check, per link: "checking" while it runs, then what it found.
  const [run, setRun] = useState<Record<string, { state: "checking" | "done" | "error"; text: string }>>({});

  const checkOne = async (w: Watcher) => {
    setRun((r) => ({ ...r, [w.id]: { state: "checking", text: `Opening ${host(w.url)} and reading its links…` } }));
    try {
      const r = await api("POST", "/api/watchers/check", { id: w.id });
      const text = r.error ? r.error
        : r.baseline ? `First check — ${r.found} links recorded as already there. From now on only new ones are announced.`
        : r.fresh.length ? `${r.fresh.length} new notice${r.fresh.length === 1 ? "" : "s"} found — shown below and sent to the people on this link.`
        : `Read ${r.found} links — nothing new.`;
      setRun((x) => ({ ...x, [w.id]: { state: r.error ? "error" : "done", text } }));
    } catch (e) { setRun((x) => ({ ...x, [w.id]: { state: "error", text: (e as Error).message } })); }
  };
  const checkNow = async (w: Watcher) => { await checkOne(w); refreshWatchers(); refreshItems(); };
  const checkAll = async () => {
    for (const w of watchers.filter((x) => x.active)) await checkOne(w);
    refreshWatchers(); refreshItems();
  };
  const anyChecking = Object.values(run).some((r) => r.state === "checking");
  const toggle = async (w: Watcher) => { await api("PATCH", "/api/watchers", { id: w.id, active: !w.active }).catch((e) => setNote(e.message)); refreshWatchers(); };
  const remove = async (w: Watcher) => {
    const ok = await confirmDialog({ title: `Stop watching ${label(w)}?`, body: "The link and the notices found on it are removed from this tab. Emails and Telegram messages already sent stay where they are.", action: "Remove", danger: true });
    if (!ok) return;
    await api("DELETE", `/api/watchers?id=${w.id}`).catch((e) => setNote(e.message));
    if (site === w.id) setSite("all");
    refreshWatchers(); refreshItems();
  };

  // Newest first, in day sections: Today, Yesterday, Day before yesterday, then by
  // date. Anything older than a week goes in one "Older" section at the bottom, and
  // a document that was already on the page and carries no date of its own goes
  // last — its age is unknown, and the day we first read it says nothing about it.
  const days_ = useMemo(() => {
    const weekAgo = dayOf(Date.now() - 6 * 86_400_000);
    const out: { key: string; label: string; rows: Item[] }[] = [];
    // Whatever a check found today goes first, under "New today", even when the
    // notice itself carries an older date — it is news to us today.
    const undated = (i: Item) => i.baseline && !i.posted_at;
    const foundToday = (i: Item) => !i.baseline && dayOf(Date.parse(i.detected_at)) === dayOf(Date.now());
    const rank = (i: Item) => (foundToday(i) ? 0 : undated(i) ? 2 : 1);
    for (const i of [...items].sort((a, b) => rank(a) - rank(b) || stamp(b) - stamp(a))) {
      const d = dayOf(stamp(i));
      const key = foundToday(i) ? "new" : undated(i) ? "undated" : d < weekAgo ? "older" : d;
      let sec = out.find((x) => x.key === key);
      if (!sec) { sec = { key, label: key === "new" ? "New today" : key === "undated" ? "Already on the page · no date given" : key === "older" ? "Older" : dayLabel(d), rows: [] }; out.push(sec); }
      sec.rows.push(i);
    }
    return out;
  }, [items]);
  const allGroups = useMemo(() => [...new Set(["UG", "PG", ...watchers.map((w) => w.category).filter(Boolean) as string[]])], [watchers]);
  const byId = useMemo(() => new Map(watchers.map((w) => [w.id, w])), [watchers]);

  return (
    <div className="space-y-4">
      {/* How it's set up */}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <StatusPill ok={!!rec?.email} icon={<IconMail size={14} />} on="Email sending on" off="Email not connected yet" />
        <StatusPill ok={!!rec?.telegram} icon={<IconBrandTelegram size={14} />} on={rec?.bot ? `Telegram on · @${rec.bot}` : "Telegram on"} off="Telegram not connected yet" />
        <span className="text-[#8A92A6]">Every link is checked every 15 minutes.</span>
      </div>
      {note && (
        <div className="flex items-start gap-2 bg-brand-light text-[#232D42] rounded-xl px-4 py-3 text-[13px]">
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote(null)} className="text-[#8A92A6] hover:text-[#232D42]"><IconX size={15} /></button>
        </div>
      )}

      {/* Watched links */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-light text-brand shrink-0"><IconEye size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[16.5px] font-medium text-[#232D42] leading-tight">Watched links</div>
            <div className="text-[11.5px] text-[#8A92A6] mt-0.5">The pages we check, who hears about new notices, and when each was last read</div>
          </div>
          {watchers.some((w) => w.active) && (
            <button onClick={checkAll} disabled={anyChecking} className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-[#232D42] hover:border-brand hover:text-brand inline-flex items-center gap-1.5 disabled:opacity-50">
              <IconRefresh size={15} className={anyChecking ? "animate-spin" : ""} /> {anyChecking ? "Checking…" : "Check all now"}
            </button>
          )}
          <button onClick={() => setEditing("new")} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium inline-flex items-center gap-1.5"><IconPlus size={15} /> Add link</button>
        </div>
        {wLoading && !wd ? <LoadingBlock className="!py-6" size={26} /> : !watchers.length ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center text-[13px] text-[#8A92A6]">No links yet. Add the first page to watch — for example the KEA UG NEET or MCC counselling page.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {watchers.map((w) => (
              <div key={w.id} className={`py-3 flex items-start gap-3 flex-wrap ${w.active ? "" : "opacity-60"}`}>
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-[#232D42]">{label(w)}</span>
                    {w.category && <span className={`text-[11px] rounded px-1.5 py-0.5 ${groupCls(w.category)}`}>{w.category}</span>}
                    {w.auto_category && <span className="text-[11px] rounded px-1.5 py-0.5 bg-gray-100 text-[#4A5468]">auto-grouped</span>}
                    {!w.active && <span className="text-[11px] rounded px-1.5 py-0.5 bg-gray-100 text-[#4A5468]">paused</span>}
                  </div>
                  <a href={w.url} target="_blank" rel="noreferrer" className="text-[12px] text-[#8A92A6] hover:text-brand inline-flex items-center gap-1 break-all">{w.url} <IconExternalLink size={12} className="shrink-0" /></a>
                  <div className="text-[12px] text-[#8A92A6] mt-1 flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1"><IconMail size={13} /> {w.emails.length ? `${w.emails.length} ${w.emails.length === 1 ? "person" : "people"}` : "no emails"}</span>
                    <span className="inline-flex items-center gap-1"><IconBrandTelegram size={13} /> {w.telegram && w.telegram_chats.length ? `${w.telegram_chats.length} chat${w.telegram_chats.length === 1 ? "" : "s"}` : "off"}</span>
                    <span>
                      Last checked {w.last_checked_at ? `${ago(w.last_checked_at)} (${clock(w.last_checked_at)})` : "never"}
                      {w.active && w.last_checked_at ? ` · next check by ${clock(new Date(Date.parse(w.last_checked_at) + 15 * 60_000).toISOString())}` : ""}
                      {w.last_count != null ? ` · ${w.last_count} links on the page` : ""}
                    </span>
                  </div>
                  {run[w.id] && (
                    <div className={`text-[12px] mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${run[w.id].state === "checking" ? "bg-brand-light text-brand" : run[w.id].state === "error" ? "bg-[#FDECEC] text-[#C03221]" : "bg-[#EEF7F1] text-[#1E7B4C]"}`}>
                      {run[w.id].state === "checking" ? <IconRefresh size={13} className="animate-spin" /> : run[w.id].state === "error" ? <IconAlertTriangle size={13} /> : <IconCheck size={13} />}
                      {run[w.id].text}
                    </div>
                  )}
                  {w.last_error && <div className="text-[12px] text-[#C03221] mt-1 inline-flex items-center gap-1"><IconAlertTriangle size={13} /> {w.last_error}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => checkNow(w)} disabled={run[w.id]?.state === "checking"} className="h-8 px-3 rounded-lg border border-gray-200 text-[12.5px] text-[#232D42] hover:border-brand hover:text-brand inline-flex items-center gap-1 disabled:opacity-50"><IconRefresh size={14} className={run[w.id]?.state === "checking" ? "animate-spin" : ""} /> {run[w.id]?.state === "checking" ? "Checking…" : "Check now"}</button>
                  <IconBtn title="Edit" onClick={() => setEditing(w)}><IconPencil size={15} /></IconBtn>
                  <IconBtn title={w.active ? "Pause" : "Resume"} onClick={() => toggle(w)}>{w.active ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}</IconBtn>
                  <IconBtn title="Remove" danger onClick={() => remove(w)}><IconTrash size={15} /></IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* News */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-light text-brand shrink-0"><IconNews size={18} /></span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[16.5px] font-medium text-[#232D42] leading-tight">News</div>
            <div className="text-[11.5px] text-[#8A92A6] mt-0.5">Newest first · UG / PG read from each notice&apos;s own title and link</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-[130px]"><PreviewSelect value={group} onChange={setGroup} options={[{ value: "all", label: "All groups" }, ...allGroups.map((g) => ({ value: g, label: `${g} news` })), { value: "Other", label: "Other" }]} /></div>
            <div className="w-[190px]"><PreviewSelect value={site} onChange={setSite} options={[{ value: "all", label: "All websites" }, ...watchers.map((w) => ({ value: w.id, label: label(w) }))]} /></div>
            <div className="w-[130px]"><PreviewSelect value={days} onChange={setDays} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "0", label: "All time" }]} /></div>
            <label className="text-[12.5px] text-[#4A5468] inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[#3A57E8]" /> Include documents already there
            </label>
          </div>
        </div>
        {iLoading && !id ? <LoadingBlock className="!py-6" size={26} /> : !items.length ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center text-[13px] text-[#8A92A6]">
            {watchers.length ? "Nothing new in this period. New notices appear here within 15 minutes of being posted." : "Add a link above to start watching."}
          </div>
        ) : (
          <div className="space-y-5">
            {days_.map((sec) => (
              <div key={sec.key}>
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Day headings as pills: today's in green so the fresh news stands out. */}
                  <span className={`text-[12px] font-medium rounded-full px-2.5 py-0.5 ${sec.key === "new" ? "bg-[#EEF7F1] text-[#1E7B4C]" : "bg-gray-100 text-[#4A5468]"}`}>{sec.label}</span>
                  <span className="text-[11.5px] text-[#8A92A6]">{sec.rows.length}</span>
                  <span className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="divide-y divide-gray-100">
                  {sec.rows.map((i) => {
                    const w = byId.get(i.watcher_id);
                    const g = i.grp || "Other";
                    return (
                      <div key={i.id} className="py-2.5">
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] rounded px-1.5 py-0.5 shrink-0 w-[58px] text-center ${groupCls(g)}`}>{g}</span>
                          {isNew(i) && <span className="text-[10.5px] font-medium rounded-full px-2 py-0.5 bg-[#EEF7F1] text-[#1E7B4C] shrink-0">New</span>}
                          {sec.key !== "undated" && (
                            <span className="text-[12px] text-[#4A5468] shrink-0 tabular-nums" title={i.posted_at ? "Date from the notice itself" : "When we found it"}>
                              {new Date(stamp(i)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: sec.key === "older" ? "numeric" : undefined, timeZone: "Asia/Kolkata" })}
                              {i.posted_at && new Date(i.posted_at).getUTCHours() === 18 && new Date(i.posted_at).getUTCMinutes() === 30 ? "" : `, ${clock(new Date(stamp(i)).toISOString())}`}
                            </span>
                          )}
                          <a href={i.item_url} target="_blank" rel="noreferrer" className={`text-[13.5px] hover:text-brand flex-1 min-w-0 truncate text-[#232D42] ${isNew(i) ? "font-medium" : ""}`}>{i.title || i.item_url}</a>
                          {i.emailed_at && <IconMail size={14} className="text-[#8A92A6] shrink-0" aria-label="Emailed" />}
                          {i.telegram_at && <IconBrandTelegram size={14} className="text-[#8A92A6] shrink-0" aria-label="Sent on Telegram" />}
                          <span className="text-[11.5px] text-[#8A92A6] shrink-0 w-[150px] truncate text-right">{w ? label(w) : ""}</span>
                          {/* A PDF opens in the browser's viewer (download from there); a web page opens as itself. */}
                          {isPdf(i.item_url) ? (
                            <a href={i.item_url} target="_blank" rel="noreferrer" title="Open the PDF — view or download" className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-gray-200 text-[11.5px] text-[#C03221] hover:border-[#C03221] shrink-0">
                              <IconFileTypePdf size={15} /> PDF
                            </a>
                          ) : (
                            <a href={i.item_url} target="_blank" rel="noreferrer" title="Open the page" className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-gray-200 text-[11.5px] text-[#4A5468] hover:border-brand hover:text-brand shrink-0">
                              <IconWorld size={15} /> Page
                            </a>
                          )}
                        </div>
                        <Summary item={i} onDone={refreshItems} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <WatcherModal
          watcher={editing === "new" ? null : editing}
          rec={rec}
          categories={allGroups}
          onRefreshRecipients={refreshRec}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNote(msg); refreshWatchers(); refreshRec(); }}
        />
      )}
    </div>
  );
}

// The notice's one-line summary under its title. New notices get one automatically
// when a check finds them; older ones can be summarised on request.
function Summary({ item, onDone }: { item: Item; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const indent = "pl-[70px]";
  if (item.summary) {
    return (
      <div className={`${indent} mt-1 text-[12.5px] text-[#4A5468] leading-snug flex items-start gap-1.5`}>
        <IconSparkles size={13} className="text-[#8A92A6] mt-[3px] shrink-0" />
        <span>{item.summary}{item.summary_from === "title" && <span className="text-[#8A92A6]"> · from the title only</span>}</span>
      </div>
    );
  }
  const run = async () => {
    setBusy(true); setErr(null);
    try { await api("POST", "/api/watchers/summarize", { id: item.id }); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className={`${indent} mt-0.5`}>
      <button onClick={run} disabled={busy} className="text-[12px] text-brand inline-flex items-center gap-1 disabled:opacity-60">
        <IconSparkles size={13} /> {busy ? "Reading the notice…" : "Summarize"}
      </button>
      {err && <span className="text-[12px] text-[#C03221] ml-2">{err}</span>}
    </div>
  );
}

function StatusPill({ ok, icon, on, off }: { ok: boolean; icon: React.ReactNode; on: string; off: string }) {
  return <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full ${ok ? "bg-[#EEF7F1] text-[#1E7B4C]" : "bg-gray-100 text-[#4A5468]"}`}>{icon}{ok ? on : off}</span>;
}
function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className={`h-8 w-8 rounded-lg border border-gray-200 grid place-items-center ${danger ? "text-[#C03221] hover:border-[#C03221]" : "text-[#4A5468] hover:border-brand hover:text-brand"}`}>{children}</button>;
}

// Add / edit a link: the page, its category, who gets emails, who gets Telegram.
function WatcherModal({ watcher, rec, categories, onRefreshRecipients, onClose, onSaved }: {
  watcher: Watcher | null; rec?: Recipients; categories: string[];
  onRefreshRecipients: () => void; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [url, setUrl] = useState(watcher?.url || "");
  const [name, setName] = useState(watcher?.name || "");
  const [category, setCategory] = useState(watcher?.category || "");
  const [auto, setAuto] = useState(watcher ? watcher.auto_category : true);
  const [emails, setEmails] = useState<string[]>(watcher?.emails || []);
  const [typed, setTyped] = useState("");
  const [telegram, setTelegram] = useState(watcher?.telegram || false);
  const [chats, setChats] = useState<string[]>(watcher?.telegram_chats || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const known = useMemo(() => {
    const team = rec?.team || [];
    const extra = [...new Set([...(rec?.others || []), ...emails])].filter((e) => !team.some((t) => t.email === e));
    return [...team.map((t) => ({ email: t.email, name: t.name })), ...extra.map((e) => ({ email: e, name: "" }))];
  }, [rec, emails]);
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const addTyped = () => {
    const e = typed.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr(`"${typed}" isn't an email address.`); return; }
    setEmails((l) => (l.includes(e) ? l : [...l, e])); setTyped(""); setErr(null);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { url, name, category, autoCategory: auto, emails, telegram, telegramChats: telegram ? chats : [] };
      if (watcher) await api("PATCH", "/api/watchers", { id: watcher.id, ...body });
      else await api("POST", "/api/watchers", body);
      onSaved(watcher ? "Saved." : "Added. The first check records what's on the page now; anything posted after that is announced.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const inp = "h-9 px-3 rounded-lg border border-gray-200 text-[13.5px] text-[#232D42] outline-none focus:border-brand w-full";

  return (
    <Overlay onClose={onClose}>
      {/* Overlay portals to <body>, outside the page's .preview-scope — without the
          class here the brand tokens are gone. Width inline: the scope sets its own. */}
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }} className="preview-scope bg-white rounded-2xl w-full my-10 border border-gray-100">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="text-[16px] font-medium text-[#232D42] flex-1">{watcher ? `Edit ${label(watcher)}` : "Add a link to watch"}</div>
          <button onClick={onClose} className="text-[#8A92A6] hover:text-[#232D42]"><IconX size={18} /></button>
        </div>
        <div className="p-5 space-y-5">
          <Field label="Link">
            <input className={inp} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cetonline.karnataka.gov.in/kea/ugneet2026" autoFocus />
          </Field>
          <Field label="Name" hint="optional — shown on the dashboard and in the email">
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="KEA UG NEET 2026" />
          </Field>
          <Field label="Category">
            <div className="flex items-center gap-2 flex-wrap">
              {[...new Set([...categories, ...(category ? [category] : [])])].map((c) => (
                <button key={c} onClick={() => setCategory(category === c ? "" : c)} className={`h-8 px-3 rounded-full text-[12.5px] border ${category === c ? "bg-brand text-white border-brand" : "border-gray-200 text-[#232D42] hover:border-brand"}`}>{c}</button>
              ))}
              <input className="h-8 px-3 rounded-full border border-gray-200 text-[12.5px] text-[#232D42] outline-none focus:border-brand w-[150px]" placeholder="+ new category"
                onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setCategory(v); (e.target as HTMLInputElement).value = ""; } } }} />
            </div>
            <label className="mt-2.5 flex items-start gap-2 text-[13px] text-[#232D42] cursor-pointer">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 accent-[#3A57E8]" />
              <span>Auto-categorize <span className="text-[#8A92A6]">— group every notice as UG or PG from its own title and link. The category above is only used when a notice doesn&apos;t say.</span></span>
            </label>
          </Field>
          <Field label="Email" hint={rec && !rec.email ? "email sending isn't connected yet — the list is saved and used once it is" : undefined}>
            <div className="max-h-[180px] overflow-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {known.map((k) => (
                <label key={k.email} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#F6F7FB]">
                  <input type="checkbox" checked={emails.includes(k.email)} onChange={() => setEmails((l) => flip(l, k.email))} className="accent-[#3A57E8]" />
                  <span className="text-[13px] text-[#232D42]">{k.name || k.email}</span>
                  {k.name && <span className="text-[12px] text-[#8A92A6]">{k.email}</span>}
                </label>
              ))}
              {!known.length && <div className="px-3 py-3 text-[12.5px] text-[#8A92A6]">Loading the team…</div>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input className={inp} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTyped(); }} placeholder="Add another email address" />
              <button onClick={addTyped} className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-[#232D42] hover:border-brand hover:text-brand shrink-0">Add</button>
            </div>
          </Field>
          <Field label="Telegram">
            <label className="flex items-center gap-2 text-[13px] text-[#232D42] cursor-pointer">
              <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} className="accent-[#3A57E8]" /> Send new notices on Telegram
            </label>
            {telegram && (
              !rec?.telegram ? (
                <div className="mt-2 text-[12.5px] text-[#8A92A6]">Telegram isn&apos;t connected yet. Once the GooCampus bot is set up, people who press Start on it will appear here to pick.</div>
              ) : (
                <div className="mt-2">
                  <div className="max-h-[150px] overflow-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
                    {(rec.chats || []).map((c) => (
                      <label key={c.chat_id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#F6F7FB]">
                        <input type="checkbox" checked={chats.includes(c.chat_id)} onChange={() => setChats((l) => flip(l, c.chat_id))} className="accent-[#3A57E8]" />
                        <span className="text-[13px] text-[#232D42]">{c.name}</span>
                        <span className="text-[12px] text-[#8A92A6]">{c.kind === "private" ? (c.username ? `@${c.username}` : "person") : c.kind}</span>
                      </label>
                    ))}
                    {!rec.chats?.length && <div className="px-3 py-3 text-[12.5px] text-[#8A92A6]">Nobody yet.</div>}
                  </div>
                  <div className="text-[12px] text-[#8A92A6] mt-1.5 flex items-center gap-2 flex-wrap">
                    <span>Not listed? Open {rec.bot ? <a className="text-brand" href={`https://t.me/${rec.bot}`} target="_blank" rel="noreferrer">@{rec.bot}</a> : "the bot"} in Telegram and press Start (or add it to a group), then</span>
                    <button onClick={onRefreshRecipients} className="text-brand inline-flex items-center gap-1"><IconRefresh size={12} /> refresh</button>
                  </div>
                </div>
              )
            )}
          </Field>
          {err && <div className="text-[12.5px] text-[#C03221]">{err}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-[13px] text-[#232D42]">Cancel</button>
          <button onClick={save} disabled={busy || !url.trim()} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><IconCheck size={15} /> {busy ? "Saving…" : watcher ? "Save" : "Add link"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label: l, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] font-medium text-[#232D42] mb-1.5">{l}{hint && <span className="font-normal text-[#8A92A6]"> · {hint}</span>}</div>
      {children}
    </div>
  );
}
