"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconX, IconMessage, IconCircleDashed, IconChartBar, IconBold, IconItalic, IconStrikethrough,
  IconCode, IconList, IconListNumbers, IconQuote, IconMoodSmile, IconPaperclip, IconTemplate,
  IconCalendarEvent, IconClock, IconSend, IconUsers, IconInfoCircle, IconPlus, IconTrash, IconDeviceFloppy, IconChecks,
} from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { RecipientPicker, type Recipient } from "./RecipientPicker";
import { confirmDialog, promptDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import type { WaKind } from "@/lib/whatsapp";

// The compose popup, built to match the tool this replaces: tabs across the top,
// recipients, the message, when to send, and a live WhatsApp preview beside it.

const IST = "en-IN";
type Template = { id: string; name: string; body: string; imageUrl: string | null };

const fmtLong = (d: Date) =>
  d.toLocaleDateString(IST, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
  " at " + d.toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" });

/** WhatsApp's markup, as far as the preview needs it. */
export function renderWa(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```|https?:\/\/\S+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("http")) out.push(<a key={k++} href={t} target="_blank" rel="noreferrer" className="text-[#027eb5] underline break-all">{t}</a>);
    else if (t.startsWith("```")) out.push(<code key={k++} className="font-mono text-[12px]">{t.slice(3, -3)}</code>);
    else if (t.startsWith("*")) out.push(<b key={k++} className="font-semibold">{t.slice(1, -1)}</b>);
    else if (t.startsWith("_")) out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    else out.push(<s key={k++}>{t.slice(1, -1)}</s>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Images are compressed before they are uploaded: long edge 1600px, JPEG quality
// 0.7. A WebP has to become a JPEG anyway — WhatsApp shows a WebP as a sticker —
// and a 6 MB phone photo is slow to send for no visible gain on a phone screen.
async function compressImage(file: File): Promise<File> {
  if (!/^image\//i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.7));
    if (!blob || blob.size >= file.size) return /image\/webp/i.test(file.type) && blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export function ComposeModal({ initialDate, onClose, onSaved }: {
  initialDate?: string;                 // yyyy-mm-dd, when opened from a day in the calendar
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<WaKind>("message");
  const [chats, setChats] = useState<Recipient[]>([]);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pollName, setPollName] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);
  const [date, setDate] = useState(initialDate || new Date().toLocaleDateString("en-CA"));
  const [time, setTime] = useState(() => { const d = new Date(Date.now() + 30 * 60000); return d.toTimeString().slice(0, 5); });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/scheduler/whatsapp/templates", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => setTemplates([]));
  }, []);

  const at = useMemo(() => (date && time ? new Date(`${date}T${time}`) : null), [date, time]);
  const inPast = !!at && !isNaN(at.getTime()) && at.getTime() < Date.now() - 60_000;
  const setToNow = () => { const n = new Date(); setDate(n.toLocaleDateString("en-CA")); setTime(n.toTimeString().slice(0, 5)); };

  // Wrap the selection in WhatsApp's markers, the way the toolbar buttons read.
  const wrap = (mark: string) => {
    const el = textRef.current; if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const sel = body.slice(a, b) || "text";
    const next = body.slice(0, a) + mark + sel + mark + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, a + mark.length + sel.length); });
  };
  const prefixLines = (prefix: string | ((i: number) => string)) => {
    const el = textRef.current; if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const lines = (body.slice(a, b) || "item").split("\n");
    const next = body.slice(0, a) + lines.map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l).join("\n") + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => el.focus());
  };

  const upload = async (f: File) => {
    setUploading(true); setErr(null);
    try {
      const file = await compressImage(f);
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/scheduler/upload-media", { method: "POST", body: fd, credentials: "same-origin" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setImageUrl(d.url);
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  };

  const saveTemplate = async () => {
    const name = await promptDialog({ title: "Save as a template", body: "You can reuse it from the Templates button.", placeholder: "e.g. Cut-offs — Tamil Nadu", action: "Save" });
    if (!name) return;
    const res = await fetch("/api/scheduler/whatsapp/templates", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ name, body, imageUrl }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error || "Couldn't save the template."); return; }
    setTemplates((t) => [...(t || []).filter((x) => x.id !== d.template.id), d.template]);
  };

  const removeTemplate = async (t: Template) => {
    if (!await confirmDialog({ title: `Delete "${t.name}"?`, action: "Delete", danger: true })) return;
    await fetch(`/api/scheduler/whatsapp/templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE", credentials: "same-origin" });
    setTemplates((list) => (list || []).filter((x) => x.id !== t.id));
  };

  // What the footer says, in the same order the old tool said it.
  const recipientLine =
    kind === "status" ? "Posted to your WhatsApp Status — everyone in your contacts sees it."
    : chats.length === 0 ? "No recipients chosen yet"
    : chats.length === 1 ? `One ${kind === "poll" ? "poll" : "message"} to ${chats[0].label}`
    : `${chats.length} separate ${kind === "poll" ? "polls" : "messages"}, one to each recipient`;

  const problem =
    kind !== "status" && !chats.length ? "Please add at least one recipient"
    : kind === "poll" && !pollName.trim() ? "Please write the poll question"
    : kind === "poll" && pollOptions.filter((o) => o.trim()).length < 2 ? "A poll needs at least two options"
    : kind !== "poll" && !body.trim() && !imageUrl ? "Please enter a message or attach a file"
    : !at || isNaN(at.getTime()) ? "Please pick a date and a time"
    : null;

  const submit = async () => {
    if (problem || inPast) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/scheduler/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          kind, chats: chats.map((c) => ({ id: c.id, label: c.label })),
          body: body.trim(), imageUrl: imageUrl.trim() || undefined,
          poll: kind === "poll" ? { name: pollName.trim(), options: pollOptions.map((o) => o.trim()).filter(Boolean), multipleAnswers: pollMulti } : undefined,
          scheduleTimeISO: at!.toISOString(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      onSaved(); onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const TABS: { key: WaKind; label: string; icon: typeof IconMessage }[] = [
    { key: "message", label: "Message", icon: IconMessage },
    { key: "poll", label: "Poll", icon: IconChartBar },
    { key: "status", label: "Status", icon: IconCircleDashed },
  ];

  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="preview-scope w-full max-w-[1120px] my-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* Left — the composer */}
        <div className="bg-white rounded-2xl border border-gray-100 flex flex-col max-h-[86vh]">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
            <span className="text-[13px] text-[#8A92A6]">Schedule a</span>
            <div className="inline-flex bg-[#F6F7FB] border border-gray-100 rounded-lg p-0.5 gap-0.5">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setKind(t.key)}
                  className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-md transition ${kind === t.key ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-[#232D42]" aria-label="Close"><IconX size={18} /></button>
          </div>

          <div className="overflow-y-auto px-5 py-4 flex-1">
            {kind === "status" ? (
              <div className="flex items-start gap-2 rounded-xl border border-gray-100 bg-[#F6F7FB] px-3 py-2.5 text-[12.5px] text-[#4A5468] mb-4">
                <IconInfoCircle size={15} className="mt-0.5 flex-shrink-0 text-[#8A92A6]" />
                A status goes to everyone in the account&apos;s contacts and disappears after 24 hours. Picking who sees it needs the WhatsApp contact sync, which isn&apos;t connected yet.
              </div>
            ) : (
              <div className="mb-4"><RecipientPicker selected={chats} onChange={setChats} /></div>
            )}

            {kind === "poll" ? (
              <>
                <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Poll question</label>
                <input value={pollName} onChange={(e) => setPollName(e.target.value)} placeholder="e.g. Which session time suits you?"
                  className="w-full mt-1.5 mb-3 rounded-xl border border-gray-200 focus:border-brand outline-none p-2.5 text-[13.5px] text-[#232D42]" />
                <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Options</label>
                <div className="flex flex-col gap-2 mt-1.5 mb-2">
                  {pollOptions.map((o, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={o} onChange={(e) => setPollOptions((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 rounded-xl border border-gray-200 focus:border-brand outline-none p-2.5 text-[13px] text-[#232D42]" />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions((s) => s.filter((_, j) => j !== i))}
                          className="px-2 rounded-xl border border-gray-200 text-[#8A92A6] hover:border-[#C03221] hover:text-[#C03221]"><IconTrash size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 12 && (
                  <button onClick={() => setPollOptions((s) => [...s, ""])} className="text-[12.5px] text-brand hover:underline inline-flex items-center gap-1 mb-3"><IconPlus size={13} /> Add an option</button>
                )}
                <label className="flex items-center gap-2 text-[12.5px] text-[#4A5468] mb-1">
                  <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} /> Let people pick more than one
                </label>
              </>
            ) : (
              <>
                <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Message</label>
                <div className="mt-1.5 rounded-xl border border-gray-200 focus-within:border-brand">
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 flex-wrap">
                    {([[IconBold, "*", "Bold"], [IconItalic, "_", "Italic"], [IconStrikethrough, "~", "Strikethrough"], [IconCode, "```", "Monospace"]] as const).map(([Icon, mark, title]) => (
                      <button key={title} title={title} onClick={() => wrap(mark)} className="w-7 h-7 grid place-items-center rounded text-[#4A5468] hover:bg-[#F6F7FB]"><Icon size={15} /></button>
                    ))}
                    <span className="w-px h-4 bg-gray-200 mx-1" />
                    <button title="Bulleted list" onClick={() => prefixLines("• ")} className="w-7 h-7 grid place-items-center rounded text-[#4A5468] hover:bg-[#F6F7FB]"><IconList size={15} /></button>
                    <button title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)} className="w-7 h-7 grid place-items-center rounded text-[#4A5468] hover:bg-[#F6F7FB]"><IconListNumbers size={15} /></button>
                    <button title="Quote" onClick={() => prefixLines("> ")} className="w-7 h-7 grid place-items-center rounded text-[#4A5468] hover:bg-[#F6F7FB]"><IconQuote size={15} /></button>
                    <button title="Emoji" onClick={() => setBody((b) => b + "🙂")} className="w-7 h-7 grid place-items-center rounded text-[#4A5468] hover:bg-[#F6F7FB]"><IconMoodSmile size={15} /></button>
                    <span className="ml-auto flex items-center gap-1.5">
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="inline-flex items-center gap-1 text-[12px] rounded-lg border border-gray-200 px-2 py-1 text-[#4A5468] hover:border-brand hover:text-brand disabled:opacity-50">
                        <IconPaperclip size={13} /> {uploading ? "Adding…" : "Add files"}
                      </button>
                      <button onClick={() => setShowTemplates((v) => !v)}
                        className={`inline-flex items-center gap-1 text-[12px] rounded-lg border px-2 py-1 ${showTemplates ? "bg-brand-light text-brand-dark border-brand" : "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"}`}>
                        <IconTemplate size={13} /> Templates
                      </button>
                    </span>
                  </div>

                  {showTemplates && (
                    <div className="px-2 py-2 border-b border-gray-100 bg-[#F6F7FB]">
                      {templates === null ? <div className="text-[12.5px] text-[#8A92A6] px-1 py-1">Loading…</div>
                        : templates.length === 0 ? <div className="text-[12.5px] text-[#8A92A6] px-1 py-1">No templates yet — write a message and press “Save as template”.</div>
                        : (
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                            {templates.map((t) => (
                              <div key={t.id} className="flex items-center gap-2">
                                <button onClick={() => { setBody(t.body); if (t.imageUrl) setImageUrl(t.imageUrl); setShowTemplates(false); }}
                                  className="flex-1 text-left text-[12.5px] text-[#232D42] bg-white border border-gray-100 rounded px-2 py-1 hover:border-brand truncate">{t.name}</button>
                                <button onClick={() => removeTemplate(t)} className="text-gray-300 hover:text-[#C03221]"><IconTrash size={13} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      <button onClick={saveTemplate} disabled={!body.trim() && !imageUrl}
                        className="mt-2 inline-flex items-center gap-1 text-[12px] text-brand hover:underline disabled:opacity-40 disabled:no-underline">
                        <IconDeviceFloppy size={13} /> Save this message as a template
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 p-2">
                    <textarea ref={textRef} value={body} onChange={(e) => setBody(e.target.value)} rows={8}
                      placeholder="Type your message…"
                      className="flex-1 outline-none text-[13.5px] text-[#232D42] resize-y bg-transparent" />
                    {imageUrl && (
                      <div className="relative w-16 flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-100"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        <button onClick={() => setImageUrl("")} title="Remove"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 text-[#8A92A6] grid place-items-center hover:text-[#C03221]"><IconX size={12} /></button>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                </div>
                <div className="text-[11.5px] text-[#8A92A6] mt-1.5">Images are compressed before sending, so they arrive quickly.</div>
              </>
            )}

            <div className="mt-5">
              <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Schedule time</label>
              <div className="flex gap-2 mt-1.5 items-center">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2">
                  <IconCalendarEvent size={14} className="text-[#8A92A6]" />
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="outline-none text-[13px] text-[#232D42] bg-transparent" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2">
                  <IconClock size={14} className="text-[#8A92A6]" />
                  <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)}
                    className="outline-none text-[13px] text-[#232D42] bg-transparent" />
                </span>
                <span className="text-[11.5px] text-[#8A92A6]">IST</span>
              </div>
            </div>
          </div>

          {/* Footer — recipients, when it goes, what is missing */}
          <div className="border-t border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2 text-[12.5px] text-[#232D42]"><IconUsers size={14} className="text-[#8A92A6]" /> {recipientLine}</div>
            {at && !isNaN(at.getTime()) && !inPast && (
              <div className="flex items-center gap-2 text-[12.5px] text-[#4A5468] mt-1"><IconClock size={14} className="text-[#8A92A6]" /> This message will be sent on {fmtLong(at)}.</div>
            )}
            {inPast && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg bg-amber-50 border border-amber-100 text-amber-800 text-[12.5px] px-3 py-2 mt-2">
                That time has already passed. Pick a new time, or set it to now.
                <button onClick={setToNow} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white border border-amber-200 px-2.5 py-1 font-medium hover:border-amber-300"><IconClock size={13} /> Set to now</button>
              </div>
            )}
            {problem && !inPast && <div className="text-[12px] text-[#8A92A6] mt-1.5">{problem}</div>}
            {err && <div className="text-[12.5px] rounded-lg px-3 py-2 mt-2 bg-rose-50 text-rose-700 border border-rose-100">{err}</div>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={onClose} className="text-[13px] text-[#4A5468] px-3 py-2 rounded-xl hover:bg-[#F6F7FB]">Cancel</button>
              <button onClick={submit} disabled={busy || !!problem || inPast}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
                <IconSend size={15} /> {busy ? "Scheduling…" : "Schedule send"}
              </button>
            </div>
          </div>
        </div>

        {/* Right — WhatsApp preview */}
        <div className="bg-[#111B21] rounded-2xl border border-[#2A3942] p-4 max-h-[86vh] overflow-y-auto">
          <div className="text-[13.5px] font-semibold text-white text-center mb-3">WhatsApp preview</div>
          <div className="text-center mb-3">
            <span className="inline-block rounded-md bg-[#1D282F] text-[#8696A0] text-[11px] px-2.5 py-1">
              {at && !isNaN(at.getTime()) ? at.toLocaleDateString(IST, { day: "numeric", month: "long", year: "numeric" }) : "Today"}
            </span>
          </div>
          <div className="ml-auto max-w-[260px] rounded-xl rounded-tr-sm px-2 pt-2 pb-1.5" style={{ background: "#005C4B" }}>
            {kind === "poll" ? (
              <div className="text-[13px] text-white">
                <div className="font-medium mb-1.5">{pollName.trim() || "Your poll question"}</div>
                <div className="flex flex-col gap-1.5">
                  {pollOptions.map((o, i) => (
                    <div key={i} className="rounded-lg border border-white/25 px-2 py-1 text-[12.5px] text-white/90">{o.trim() || `Option ${i + 1}`}</div>
                  ))}
                </div>
                <div className="text-[10.5px] text-white/60 mt-1.5">{pollMulti ? "Select one or more" : "Select one"}</div>
              </div>
            ) : (
              <>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full rounded-lg mb-1.5 block"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="text-[13px] text-[#E9EDEF] whitespace-pre-wrap break-words leading-snug">
                  {body.trim() ? renderWa(body) : <span className="text-[#8696A0] italic">Your message will appear here</span>}
                </div>
              </>
            )}
            <div className="flex items-center justify-end gap-1 text-[10.5px] text-[#8696A0] mt-0.5">
              {at && !isNaN(at.getTime()) ? at.toLocaleTimeString(IST, { hour: "numeric", minute: "2-digit" }) : ""}
              <IconChecks size={13} className="text-[#53BDEB]" />
            </div>
          </div>
          <div className="text-[11px] text-[#8696A0] mt-3 text-center">
            {kind === "status" ? "Posted as your Status" : kind === "poll" ? "Sent as a WhatsApp poll" : "Sent from the GooCampus WhatsApp Business number"}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
