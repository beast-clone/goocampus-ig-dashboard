"use client";
import { useEffect, useMemo, useState } from "react";
import {
  IconSearch, IconFilter, IconChevronLeft, IconChevronRight, IconPlus, IconTrash,
  IconCircleCheck, IconCircleDashed, IconClock, IconAlertTriangle, IconChecks, IconChartBar,
  IconMessage, IconBrandWhatsapp, IconPhoto,
} from "@tabler/icons-react";
import { LoadingBlock } from "@/components/LoadingBlock";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { ComposeModal } from "./ComposeModal";
import { chatDisplay, type WaMessage, type WaStatus } from "@/lib/whatsapp";

// Community Broadcast — the whole WhatsApp workspace, laid out like the tool it
// replaces: every scheduled message down the left, a month of sends in the middle,
// and composing in a popup. History is kept for good, so it can feed a report later.

const IST = "en-IN";
type View = "month" | "week" | "day";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(IST, { hour: "2-digit", minute: "2-digit", hour12: false });
const dayKey = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toLocaleDateString("en-CA");

// "in 3 minutes" / "6 days ago" — the rail reads as a timeline, not a list of stamps.
function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60000);
  const say = mins < 1 ? "less than a minute" : mins < 60 ? `${mins} minute${mins === 1 ? "" : "s"}`
    : mins < 1440 ? `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"}`
    : `${Math.round(mins / 1440)} day${Math.round(mins / 1440) === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${say}` : `${say} ago`;
}

const STATUS_STYLE: Record<WaStatus, { pill: string; dot: string; label: string; icon: React.ReactNode }> = {
  scheduled: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-400", label: "Scheduled", icon: <IconClock size={12} /> },
  sending: { pill: "bg-blue-50 text-blue-700", dot: "bg-blue-400", label: "Sending", icon: <IconCircleDashed size={12} className="animate-spin" /> },
  sent: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Sent", icon: <IconCircleCheck size={12} /> },
  delivered: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Delivered", icon: <IconChecks size={12} /> },
  failed: { pill: "bg-rose-50 text-rose-700", dot: "bg-rose-500", label: "Failed", icon: <IconAlertTriangle size={12} /> },
  canceled: { pill: "bg-gray-100 text-gray-500", dot: "bg-gray-300", label: "Cancelled", icon: <IconTrash size={12} /> },
};

export function BroadcastWorkspace() {
  const [rows, setRows] = useState<WaMessage[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [compose, setCompose] = useState<{ open: boolean; date?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => fetch("/api/scheduler/whatsapp", { cache: "no-store" })
    .then((r) => r.json()).then((d) => setRows(d.messages || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  // Poll while anything is still on its way.
  useEffect(() => {
    if (!rows?.some((r) => r.status === "scheduled" || r.status === "sending")) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [rows]);

  const all = rows || [];
  const failedCount = all.filter((r) => r.status === "failed").length;

  const listed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => !onlyFailed || r.status === "failed")
      .filter((r) => !needle || (r.body || "").toLowerCase().includes(needle) || (r.chat_label || r.chat_id).toLowerCase().includes(needle));
  }, [all, q, onlyFailed]);

  const upcoming = listed.filter((r) => r.status === "scheduled" || r.status === "sending")
    .sort((a, b) => a.schedule_time.localeCompare(b.schedule_time));
  const earlier = listed.filter((r) => !(r.status === "scheduled" || r.status === "sending"))
    .sort((a, b) => b.schedule_time.localeCompare(a.schedule_time));

  const cancel = async (m: WaMessage) => {
    const ok = await confirmDialog({
      title: "Cancel this message?",
      body: <>It won&apos;t be sent to {m.chat_label || chatDisplay(m.chat_id)}.</>,
      action: "Cancel message", danger: true,
    });
    if (!ok) return;
    await fetch("/api/scheduler/whatsapp/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ id: m.id }),
    });
    load();
  };

  const clearFailed = async () => {
    if (!failedCount) return;
    if (!await confirmDialog({ title: `Clear ${failedCount} failed message${failedCount === 1 ? "" : "s"}?`, body: "They're removed from this list. Nothing is sent.", action: "Clear", danger: true })) return;
    await Promise.all(all.filter((r) => r.status === "failed").map((r) =>
      fetch("/api/scheduler/whatsapp/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ id: r.id }),
      }).catch(() => {})));
    load();
  };

  return (
    <div className="preview-scope">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Left rail — every scheduled message, kept for good */}
        <aside className="bg-white border border-gray-100 rounded-2xl flex flex-col max-h-[calc(100vh-190px)]">
          <div className="px-3 py-3 border-b border-gray-100">
            <button onClick={() => setCompose({ open: true })}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white text-[13px] font-medium px-3 py-2 mb-2 hover:bg-brand-dark">
              <IconPlus size={15} /> New message
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <IconSearch size={15} className="text-[#8A92A6]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scheduled messages"
                className="flex-1 min-w-0 outline-none text-[13px] text-[#232D42] bg-transparent" />
              <button onClick={() => setOnlyFailed((v) => !v)} title="Show failed only"
                className={`flex-shrink-0 ${onlyFailed ? "text-brand" : "text-[#8A92A6] hover:text-[#232D42]"}`}><IconFilter size={15} /></button>
            </div>
            {failedCount > 0 && (
              <button onClick={clearFailed} className="mt-2 text-[12px] text-[#C03221] hover:underline">Clear failed ({failedCount})</button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {rows === null ? <div className="p-6"><LoadingBlock label="Loading…" /></div>
              : listed.length === 0 ? <div className="px-4 py-10 text-center text-[13px] text-[#8A92A6]">{all.length ? "Nothing matches that search." : "Nothing scheduled yet."}</div>
              : (
                <>
                  {upcoming.length > 0 && <RailGroup title="Upcoming" rows={upcoming} selected={selected} onSelect={setSelected} onCancel={cancel} />}
                  {earlier.length > 0 && <RailGroup title="Earlier" rows={earlier} selected={selected} onSelect={setSelected} onCancel={cancel} />}
                </>
              )}
          </div>
        </aside>

        {/* Main — the calendar */}
        <section className="bg-white border border-gray-100 rounded-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
            <button onClick={() => setCursor(new Date())} className="text-[12.5px] font-medium rounded-lg border border-gray-200 px-3 py-1.5 text-[#4A5468] hover:border-brand hover:text-brand">Today</button>
            <button onClick={() => setCursor(step(cursor, view, -1))} className="w-7 h-7 rounded-lg border border-gray-200 grid place-items-center text-[#4A5468] hover:border-brand hover:text-brand"><IconChevronLeft size={15} /></button>
            <button onClick={() => setCursor(step(cursor, view, 1))} className="w-7 h-7 rounded-lg border border-gray-200 grid place-items-center text-[#4A5468] hover:border-brand hover:text-brand"><IconChevronRight size={15} /></button>
            <div className="ml-1">
              <div className="text-[15px] font-medium text-[#232D42] leading-tight">{headline(cursor, view)}</div>
              <div className="text-[11.5px] text-[#8A92A6]">{countIn(all, cursor, view)} sends this {view}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex bg-[#F6F7FB] border border-gray-100 rounded-lg p-0.5 gap-0.5">
                {(["month", "week", "day"] as View[]).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`text-[12.5px] font-medium px-3 py-1.5 rounded-md capitalize transition ${view === v ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4">
            {rows === null ? <div className="h-64 grid place-items-center"><LoadingBlock label="Loading…" /></div>
              : <Grid rows={all} view={view} cursor={cursor} selected={selected}
                  onSelect={setSelected} onAdd={(d) => setCompose({ open: true, date: d })} />}
          </div>
        </section>
      </div>

      {compose?.open && (
        <ComposeModal initialDate={compose.date} onClose={() => setCompose(null)} onSaved={load} />
      )}
    </div>
  );
}

function RailGroup({ title, rows, selected, onSelect, onCancel }: {
  title: string; rows: WaMessage[]; selected: string | null;
  onSelect: (id: string) => void; onCancel: (m: WaMessage) => void;
}) {
  return (
    <div>
      <div className="px-4 py-1.5 text-[10.5px] uppercase tracking-wide text-[#8A92A6] bg-[#F6F7FB]">{title}</div>
      {rows.map((m) => {
        const st = STATUS_STYLE[m.status];
        return (
          <button key={m.id} onClick={() => onSelect(m.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-50 flex gap-2.5 ${selected === m.id ? "bg-brand-light/40" : "hover:bg-[#F6F7FB]"}`}>
            <span className="w-8 h-8 rounded-full bg-brand-light text-brand grid place-items-center flex-shrink-0">
              {m.kind === "poll" ? <IconChartBar size={15} /> : m.kind === "status" ? <IconBrandWhatsapp size={15} /> : m.image_url ? <IconPhoto size={15} /> : <IconMessage size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-[#232D42] truncate">{m.chat_label || chatDisplay(m.chat_id)}</span>
              <span className="block text-[11.5px] text-[#8A92A6] truncate">{m.body || (m.kind === "poll" ? m.payload?.poll?.name || "Poll" : "Image")}</span>
              <span className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] text-[#8A92A6]">{relative(m.schedule_time)} · {timeOf(m.schedule_time)}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${st.pill}`}>{st.label}</span>
              </span>
            </span>
            {m.status === "scheduled" && (
              <span onClick={(e) => { e.stopPropagation(); onCancel(m); }} title="Cancel"
                className="text-gray-300 hover:text-[#C03221] flex-shrink-0"><IconTrash size={14} /></span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── calendar helpers ──────────────────────────────────────────────────────────
const startOfWeek = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
function step(d: Date, view: View, dir: 1 | -1) {
  const x = new Date(d);
  if (view === "month") x.setMonth(x.getMonth() + dir);
  else x.setDate(x.getDate() + dir * (view === "week" ? 7 : 1));
  return x;
}
function headline(d: Date, view: View) {
  if (view === "month") return d.toLocaleDateString(IST, { month: "long", year: "numeric" });
  if (view === "day") return d.toLocaleDateString(IST, { weekday: "long", day: "numeric", month: "long" });
  const s = startOfWeek(d), e = new Date(s); e.setDate(s.getDate() + 6);
  return `${s.toLocaleDateString(IST, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(IST, { day: "numeric", month: "short" })}`;
}
function rangeOf(d: Date, view: View): [Date, Date] {
  if (view === "month") return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)];
  if (view === "day") { const a = new Date(d); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(23, 59, 59); return [a, b]; }
  const a = startOfWeek(d); const b = new Date(a); b.setDate(a.getDate() + 6); b.setHours(23, 59, 59); return [a, b];
}
const countIn = (rows: WaMessage[], d: Date, view: View) => {
  const [a, b] = rangeOf(d, view);
  return rows.filter((r) => { const t = new Date(r.schedule_time).getTime(); return t >= a.getTime() && t <= b.getTime(); }).length;
};

function Grid({ rows, view, cursor, selected, onSelect, onAdd }: {
  rows: WaMessage[]; view: View; cursor: Date; selected: string | null;
  onSelect: (id: string) => void; onAdd: (date: string) => void;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, WaMessage[]>();
    for (const r of rows) {
      const k = dayKey(r.schedule_time);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.schedule_time.localeCompare(b.schedule_time));
    return m;
  }, [rows]);

  const days: Date[] = useMemo(() => {
    if (view === "day") return [new Date(cursor)];
    if (view === "week") { const s = startOfWeek(cursor); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; }); }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Date[] = [];
    for (let i = 0; i < lead; i++) out.push(new Date(NaN));
    for (let i = 1; i <= total; i++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    return out;
  }, [cursor, view]);

  const today = dayKey(new Date());
  const cols = view === "day" ? 1 : 7;

  return (
    <div>
      {view !== "day" && (
        <div className="grid gap-1 text-[11px] text-[#8A92A6] mb-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1">{d}</div>)}
        </div>
      )}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {days.map((d, i) => {
          if (isNaN(d.getTime())) return <div key={`pad${i}`} className="min-h-[104px] rounded-lg bg-[#F6F7FB]/40" />;
          const k = dayKey(d);
          const items = byDay.get(k) || [];
          const isToday = k === today;
          return (
            <div key={k} className={`group relative rounded-lg border p-1.5 ${view === "day" ? "min-h-[360px]" : view === "week" ? "min-h-[220px]" : "min-h-[104px]"} ${isToday ? "border-brand bg-brand-light/20" : "border-gray-100"}`}>
              <div className="flex items-center gap-1 mb-1">
                <span className={`text-[11px] ${isToday ? "text-white bg-brand rounded-full w-5 h-5 grid place-items-center" : "text-[#8A92A6]"}`}>{d.getDate()}</span>
                <button onClick={() => onAdd(k)} title="Schedule a message on this day"
                  className="ml-auto opacity-0 group-hover:opacity-100 transition text-[10.5px] text-brand hover:underline inline-flex items-center gap-0.5"><IconPlus size={11} /> New</button>
              </div>
              <div className="flex flex-col gap-1">
                {items.slice(0, view === "month" ? 3 : 12).map((m) => {
                  const st = STATUS_STYLE[m.status];
                  return (
                    <button key={m.id} onClick={() => onSelect(m.id)}
                      title={`${m.chat_label || chatDisplay(m.chat_id)} — ${m.body || m.payload?.poll?.name || "image"}`}
                      className={`flex items-center gap-1 text-[10.5px] rounded px-1 py-0.5 w-full text-left ${selected === m.id ? "ring-1 ring-brand" : ""} ${st.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className="tabular-nums flex-shrink-0">{timeOf(m.schedule_time)}</span>
                      <span className="truncate">{m.chat_label || chatDisplay(m.chat_id)}</span>
                    </button>
                  );
                })}
                {view === "month" && items.length > 3 && <div className="text-[10.5px] text-[#8A92A6] px-1">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
