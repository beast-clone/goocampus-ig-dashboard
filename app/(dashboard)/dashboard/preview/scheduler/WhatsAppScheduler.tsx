"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBrandWhatsapp, IconCalendarClock, IconPhoto, IconTrash, IconCircleCheck, IconCircleDashed,
  IconAlertTriangle, IconClock, IconSend, IconChecks, IconChevronLeft, IconChevronRight,
  IconLayoutList, IconCalendarMonth, IconX,
} from "@tabler/icons-react";
import { LoadingBlock } from "@/components/LoadingBlock";
import MissingFieldsModal from "../MissingFieldsModal";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { RecipientPicker, type Recipient } from "./RecipientPicker";
import { chatDisplay, type WaMessage, type WaStatus } from "@/lib/whatsapp";

// Community Broadcast — the WhatsApp side of the Scheduler, replacing Blueticks.
// Same shape as LinkedInScheduler: its own queue (whatsapp_scheduled_messages via
// /api/scheduler/whatsapp), polled while anything is pending. The sending happens
// on the VPS: n8n reads /api/scheduler/whatsapp/due, sends through WAHA and posts
// the outcome to /api/scheduler/whatsapp/status. This tab never touches WhatsApp.

const IST = "en-IN";
const fmtWhen = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(IST, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
};
const fmtLong = (d: Date) =>
  d.toLocaleDateString(IST, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
  " at " + d.toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" });

// WhatsApp's own markup, only as far as the preview needs it.
function renderWa(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/\S+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("http")) out.push(<a key={k++} href={t} target="_blank" rel="noreferrer" className="text-[#027eb5] underline break-all">{t}</a>);
    else if (t.startsWith("*")) out.push(<b key={k++} className="font-semibold">{t.slice(1, -1)}</b>);
    else if (t.startsWith("_")) out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    else out.push(<s key={k++}>{t.slice(1, -1)}</s>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// WhatsApp renders a WebP as a STICKER, not a photo — so convert before upload.
async function toJpegIfNeeded(file: File): Promise<File> {
  if (!/image\/webp/i.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // WebP can be transparent; JPEG can't
  ctx.drawImage(bitmap, 0, 0);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.webp$/i, "") + ".jpg", { type: "image/jpeg" });
}

export function WhatsAppScheduler({ networkSwitch }: { networkSwitch?: React.ReactNode }) {
  const [chats, setChats] = useState<Recipient[]>([]);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [when, setWhen] = useState<"later" | "now">("later");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gate, setGate] = useState<string[] | null>(null);
  const [rows, setRows] = useState<WaMessage[] | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/scheduler/whatsapp", { cache: "no-store" })
    .then((r) => r.json()).then((d) => setRows(d.messages || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  // Poll while anything is in flight, so status flips live (same as LinkedIn).
  useEffect(() => {
    if (!rows?.some((r) => r.status === "scheduled" || r.status === "sending")) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [rows]);

  const scheduledAt = useMemo(() => (date && time ? new Date(`${date}T${time}`) : null), [date, time]);
  const inPast = !!scheduledAt && !isNaN(scheduledAt.getTime()) && scheduledAt.getTime() < Date.now() - 60_000;

  const setToNow = () => {
    const n = new Date();
    setDate(n.toLocaleDateString("en-CA"));
    setTime(n.toTimeString().slice(0, 5));
    setWhen("now");
  };

  const upload = async (f: File) => {
    setUploading(true); setMsg(null);
    try {
      const file = await toJpegIfNeeded(f);
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/scheduler/upload-media", { method: "POST", body: fd, credentials: "same-origin" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setImageUrl(d.url);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    setMsg(null);
    const missing = [
      !chats.length && "At least one recipient",
      !body.trim() && !imageUrl.trim() && "A message or an image",
      when === "later" && !date && "A date to send on",
      when === "later" && !time && "A time to send at",
    ].filter((x): x is string => !!x);
    if (missing.length) { setGate(missing); return; }

    let scheduleTimeISO: string | undefined;
    if (when === "later") {
      if (!scheduledAt || isNaN(scheduledAt.getTime())) { setMsg({ ok: false, text: "That date and time don't make sense together." }); return; }
      if (inPast) { setMsg({ ok: false, text: "That time has already passed. Pick a new time, or set it to now." }); return; }
      scheduleTimeISO = scheduledAt.toISOString();
    }

    setBusy(true);
    try {
      const res = await fetch("/api/scheduler/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ chats: chats.map((c) => ({ id: c.id, label: c.label })), body: body.trim(), imageUrl: imageUrl.trim() || undefined, scheduleTimeISO }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      const many = chats.length > 1 ? ` to ${chats.length} recipients` : "";
      setMsg({
        ok: true,
        text: when === "now" ? `Queued${many} — it goes out on the next check (within a minute).` : `Scheduled${many} for ${fmtWhen(scheduleTimeISO!)}.`,
      });
      setBody(""); setImageUrl(""); setDate(""); setTime(""); setChats([]);
      load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const cancel = async (m: WaMessage) => {
    const ok = await confirmDialog({
      title: "Cancel this message?",
      body: <>It won&apos;t be sent to {m.chat_label || chatDisplay(m.chat_id)}.</>,
      action: "Cancel message", danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/scheduler/whatsapp/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ id: m.id }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ ok: false, text: d.error || "Couldn't cancel it." }); }
    load();
  };

  return (
    <div className="preview-scope">
      {networkSwitch && <div className="flex justify-end mb-5">{networkSwitch}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Composer */}
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-light text-brand"><IconBrandWhatsapp size={17} /></span>
            <div className="text-[15px] font-semibold text-[#232D42]">New WhatsApp broadcast</div>
          </div>

          <div className="mb-4"><RecipientPicker selected={chats} onChange={setChats} /></div>

          <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
            placeholder="Write your message…  *bold*  _italic_  ~strikethrough~"
            className="w-full mt-1.5 mb-1 rounded-xl border border-gray-200 focus:border-brand outline-none p-3 text-[13.5px] text-[#232D42] resize-y" />
          <div className="text-[11.5px] text-[#8A92A6] mb-4">Formatting: <b>*bold*</b> · <i>_italic_</i> · <s>~strikethrough~</s></div>

          <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold flex items-center gap-1"><IconPhoto size={13} /> Image <span className="normal-case tracking-normal text-gray-400">(optional)</span></label>
          <div className="flex flex-col sm:flex-row gap-2 mt-1.5 mb-1">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/image.jpg"
              className="flex-1 rounded-xl border border-gray-200 focus:border-brand outline-none p-2.5 text-[13px] text-[#232D42]" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="rounded-xl border border-gray-200 text-[13px] text-[#4A5468] px-3 py-2 hover:border-brand hover:text-brand disabled:opacity-50">
              {uploading ? "Uploading…" : "Upload"}
            </button>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl("")} title="Remove the image"
                className="rounded-xl border border-gray-200 text-[#8A92A6] px-2.5 hover:border-[#C03221] hover:text-[#C03221]"><IconX size={15} /></button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </div>
          <div className="text-[11.5px] text-[#8A92A6] mb-4">A WebP is converted to JPEG first — WhatsApp shows a WebP as a sticker instead of a photo.</div>

          <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">When</label>
          <div className="flex gap-2 mt-1.5 mb-3">
            {(["later", "now"] as const).map((w) => (
              <button key={w} type="button" onClick={() => setWhen(w)}
                className={`text-[12.5px] font-medium rounded-lg px-3 py-1.5 border inline-flex items-center gap-1.5 transition ${when === w ? "bg-brand-light text-brand-dark border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-gray-300"}`}>
                {w === "later" ? <IconCalendarClock size={14} /> : <IconSend size={14} />}{w === "later" ? "Schedule" : "Send now"}
              </button>
            ))}
          </div>
          {when === "later" && (
            <>
              <div className="flex gap-2 mb-2">
                <input type="date" value={date} min={new Date().toLocaleDateString("en-CA")} onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
                <span className="self-center text-[11.5px] text-[#8A92A6]">IST</span>
              </div>
              {inPast ? (
                <div className="text-[12.5px] rounded-lg px-3 py-2 mb-3 bg-amber-50 text-amber-800 border border-amber-100 flex items-center gap-2 flex-wrap">
                  That time has already passed. Pick a new time, or
                  <button type="button" onClick={setToNow} className="underline font-medium">set it to now</button>.
                </div>
              ) : scheduledAt && !isNaN(scheduledAt.getTime()) ? (
                <div className="text-[12.5px] text-[#4A5468] mb-3">This message will be sent on <b className="font-medium">{fmtLong(scheduledAt)}</b>.</div>
              ) : null}
            </>
          )}

          {msg && <div className={`text-[12.5px] rounded-lg px-3 py-2 mb-3 ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>{msg.text}</div>}

          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2.5 hover:bg-brand-dark disabled:opacity-50 transition">
            {when === "later" ? <IconCalendarClock size={15} /> : <IconSend size={15} />}
            {busy ? "Saving…" : when === "later" ? "Schedule message" : "Send now"}
          </button>
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky top-6">
            <div className="text-[13.5px] font-semibold text-[#232D42] mb-3">WhatsApp preview</div>
            <div className="rounded-xl p-4" style={{ background: "#ECE5DD" }}>
              <div className="ml-auto max-w-[280px] rounded-xl rounded-tr-sm px-2 pt-2 pb-1.5" style={{ background: "#D9FDD3" }}>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full rounded-lg mb-1.5 block"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="text-[13px] text-[#111B21] whitespace-pre-wrap break-words leading-snug">
                  {body.trim() ? renderWa(body) : <span className="text-[#667781] italic">Your message will appear here</span>}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10.5px] text-[#667781] mt-0.5">
                  {scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt.toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" }) : new Date().toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" })}
                  <IconChecks size={13} className="text-[#53BDEB]" />
                </div>
              </div>
            </div>
            <div className="text-[11.5px] text-[#8A92A6] mt-2">
              Sent from the GooCampus WhatsApp Business number. Each recipient gets their own copy.
            </div>
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="bg-white border border-gray-100 rounded-2xl mt-5">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <div className="text-[13.5px] font-semibold text-[#232D42]">Scheduled &amp; sent</div>
          <div className="ml-auto inline-flex bg-[#F6F7FB] border border-gray-100 rounded-lg p-0.5 gap-0.5">
            {([["list", "List", IconLayoutList], ["calendar", "Calendar", IconCalendarMonth]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-md transition ${view === id ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {!rows ? <div className="h-32 flex items-center justify-center"><LoadingBlock label="Loading messages…" /></div>
            : rows.length === 0 ? <div className="text-[13px] text-gray-400 py-8 text-center">Nothing scheduled yet.</div>
            : view === "list" ? (
              <div className="flex flex-col gap-2">{rows.map((m) => <QueueRow key={m.id} m={m} onCancel={cancel} />)}</div>
            ) : <MonthGrid rows={rows} />}
        </div>
      </div>

      {gate && <MissingFieldsModal gate="schedule" missing={gate} onClose={() => setGate(null)} />}
    </div>
  );
}

function StatusPill({ s }: { s: WaStatus }) {
  const map: Record<WaStatus, { c: string; i: React.ReactNode; t: string }> = {
    delivered: { c: "bg-emerald-50 text-emerald-700", i: <IconChecks size={12} />, t: "Delivered" },
    sent: { c: "bg-emerald-50 text-emerald-700", i: <IconCircleCheck size={12} />, t: "Sent" },
    scheduled: { c: "bg-amber-50 text-amber-700", i: <IconClock size={12} />, t: "Scheduled" },
    sending: { c: "bg-blue-50 text-blue-700", i: <IconCircleDashed size={12} className="animate-spin" />, t: "Sending" },
    failed: { c: "bg-rose-50 text-rose-700", i: <IconAlertTriangle size={12} />, t: "Failed" },
    canceled: { c: "bg-gray-100 text-gray-500", i: <IconTrash size={12} />, t: "Canceled" },
  };
  const v = map[s] || map.scheduled;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.c}`}>{v.i} {v.t}</span>;
}

function QueueRow({ m, onCancel }: { m: WaMessage; onCancel: (m: WaMessage) => void }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <StatusPill s={m.status} />
        <span className="text-[12px] text-[#4A5468]">{m.chat_label || chatDisplay(m.chat_id)}</span>
        {m.status === "scheduled" && (
          <button onClick={() => onCancel(m)} className="ml-auto text-gray-300 hover:text-[#C03221]" title="Cancel"><IconTrash size={14} /></button>
        )}
      </div>
      <div className="flex items-start gap-2">
        {m.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100 flex-shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="min-w-0">
          <div className="text-[12.5px] text-[#232D42] line-clamp-2">{m.body || <span className="text-gray-400 italic">image only</span>}</div>
          <div className="text-[11px] text-[#8A92A6] mt-0.5">
            {m.status === "sent" || m.status === "delivered" ? `Sent ${fmtWhen(m.sent_at || m.schedule_time)}` : fmtWhen(m.schedule_time)}
          </div>
        </div>
      </div>
      {m.status === "failed" && m.error && <div className="text-[11px] text-rose-600 mt-1">{m.error}</div>}
    </div>
  );
}

// Month view — same shape as the dashboard's other calendars: a 7-column grid,
// Monday first, with each day's messages listed inside its tile.
function MonthGrid({ rows }: { rows: WaMessage[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = new Map<string, WaMessage[]>();
    for (const r of rows) {
      const key = new Date(r.schedule_time).toLocaleDateString("en-CA");
      (m.get(key) || m.set(key, []).get(key)!).push(r);
    }
    return m;
  }, [rows]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;                                  // Monday-first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="w-7 h-7 rounded-lg border border-gray-200 text-[#4A5468] grid place-items-center hover:border-brand hover:text-brand"><IconChevronLeft size={15} /></button>
        <div className="text-[13.5px] font-medium text-[#232D42]">{month.toLocaleDateString(IST, { month: "long", year: "numeric" })}</div>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="w-7 h-7 rounded-lg border border-gray-200 text-[#4A5468] grid place-items-center hover:border-brand hover:text-brand"><IconChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-[#8A92A6] mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} className="min-h-[86px] rounded-lg bg-[#F6F7FB]/40" />;
          const key = d.toLocaleDateString("en-CA");
          const items = byDay.get(key) || [];
          return (
            <div key={key} className={`min-h-[86px] rounded-lg border p-1.5 ${key === today ? "border-brand bg-brand-light/30" : "border-gray-100"}`}>
              <div className={`text-[11px] mb-1 ${key === today ? "text-brand font-medium" : "text-[#8A92A6]"}`}>{d.getDate()}</div>
              <div className="flex flex-col gap-1">
                {items.slice(0, 3).map((m) => (
                  <div key={m.id} title={`${m.chat_label || chatDisplay(m.chat_id)} — ${m.body || "image only"}`}
                    className={`text-[10.5px] rounded px-1 py-0.5 truncate ${
                      m.status === "failed" ? "bg-rose-50 text-rose-700"
                      : m.status === "canceled" ? "bg-gray-100 text-gray-500"
                      : m.status === "scheduled" ? "bg-amber-50 text-amber-800"
                      : "bg-emerald-50 text-emerald-700"}`}>
                    {new Date(m.schedule_time).toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" })} {m.chat_label || chatDisplay(m.chat_id)}
                  </div>
                ))}
                {items.length > 3 && <div className="text-[10.5px] text-[#8A92A6] px-1">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
