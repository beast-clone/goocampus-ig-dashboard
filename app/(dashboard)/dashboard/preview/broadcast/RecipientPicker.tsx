"use client";
import { useEffect, useMemo, useState } from "react";
import { IconSearch, IconUser, IconUsers, IconSpeakerphone, IconPlus, IconX, IconCheck, IconUpload } from "@tabler/icons-react";
import { chatDisplay, chatKind, normalizeChatId, parseWaRows, type ChatKind } from "@/lib/whatsapp";

// Who a WhatsApp broadcast goes to.
//
// The list is a SOURCE the component is handed, not something it fetches itself:
// today that is the saved list (/api/scheduler/whatsapp/recipients), and when the
// WAHA contact sync is live it becomes the synced chats with no change here.

export type Recipient = { id: string; label: string; kind: ChatKind };

const KINDS: { key: ChatKind | "all"; label: string; icon: typeof IconUser }[] = [
  { key: "all", label: "All", icon: IconSearch },
  { key: "contact", label: "Contacts", icon: IconUser },
  { key: "group", label: "Groups", icon: IconUsers },
  { key: "channel", label: "Channels", icon: IconSpeakerphone },
];

const initials = (s: string) => (s || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";

function Avatar({ r }: { r: Recipient }) {
  const Icon = r.kind === "group" ? IconUsers : r.kind === "channel" ? IconSpeakerphone : IconUser;
  return (
    <span className="w-8 h-8 rounded-full bg-brand-light text-brand grid place-items-center flex-shrink-0 text-[11px] font-medium">
      {r.label && r.label !== r.id ? initials(r.label) : <Icon size={15} stroke={1.8} />}
    </span>
  );
}

export function RecipientPicker({ selected, onChange, session }: {
  selected: Recipient[];
  onChange: (next: Recipient[]) => void;
  /** Whose contacts to show — each linked number has its own. */
  session?: string;
}) {
  const [list, setList] = useState<Recipient[] | null>(null);
  const [synced, setSynced] = useState(false);
  const [kind, setKind] = useState<ChatKind | "all">("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [imported, setImported] = useState<{ added: number; skipped: number } | null>(null);

  const load = () => fetch(`/api/scheduler/whatsapp/recipients${session ? `?session=${encodeURIComponent(session)}` : ""}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => { setList(d.recipients || []); setSynced(!!d.synced); })
    .catch(() => setList([]));
  // Switching account swaps the whole list — they are different address books.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setList(null); load(); }, [session]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list || [])
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => !needle || r.label.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle));
  }, [list, kind, q]);

  // Typing a number straight into the search box is the fast path: you should not
  // have to open "Add a number or group" and fill two fields to reach one person.
  const typed = useMemo(() => {
    const id = normalizeChatId(q);
    if (!id) return null;
    if ((list || []).some((r) => r.id === id)) return null;   // already in the list below
    return { id, label: chatDisplay(id), kind: chatKind(id) } as Recipient;
  }, [q, list]);

  // Is that number actually on WhatsApp? Offering any digits someone typed means
  // a message that queues, "sends", and reaches nobody — you would only find out
  // from your own phone offering to invite them.
  //
  // Debounced, and only for a plain number: WhatsApp rate-limits this lookup, and
  // hammering it is itself a way to get a number flagged.
  const [checked, setChecked] = useState<{ id: string; exists: boolean | null } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const id = typed?.id;
    if (!id || !id.endsWith("@c.us")) { setChecked(null); setChecking(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/scheduler/whatsapp/check?phone=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json());
        setChecked({ id, exists: typeof d.exists === "boolean" ? d.exists : null });
      } catch {
        setChecked({ id, exists: null });   // could not ask ≠ not on WhatsApp
      } finally { setChecking(false); }
    }, 700);
    return () => { clearTimeout(t); setChecking(false); };
  }, [typed?.id]);

  const typedState: "checking" | "yes" | "no" | "unknown" =
    !typed ? "unknown"
    : !typed.id.endsWith("@c.us") ? "unknown"          // a group or channel id: nothing to check
    : checking || checked?.id !== typed.id ? "checking"
    : checked?.exists === true ? "yes"
    : checked?.exists === false ? "no"
    : "unknown";

  const isOn = (id: string) => selected.some((s) => s.id === id);
  const toggle = (r: Recipient) => { setImported(null); onChange(isOn(r.id) ? selected.filter((s) => s.id !== r.id) : [...selected, r]); };

  // Saving is what makes a chat reusable; a one-off can still be sent by typing it
  // and hitting Add, which selects it whether or not the save succeeds.
  const addId = async (raw: string, label?: string) => {
    setErr(null);
    const id = normalizeChatId(raw);
    if (!id) { setErr("Enter a phone number, a group id (…@g.us) or a channel id (…@newsletter)."); return; }
    // A group pasted by id is not nameless just because no name was typed: if it
    // is already saved, it has one, and a raw 1203…@g.us in the composer is what
    // makes two same-named groups impossible to tell apart.
    const known = (list || []).find((x) => x.id === id);
    const r: Recipient = { id, label: (label || "").trim() || known?.label || chatDisplay(id), kind: chatKind(id) };
    onChange(isOn(id) ? selected : [...selected, r]);
    try {
      await fetch("/api/scheduler/whatsapp/recipients", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ id, label: r.label }),
      });
      load();
    } catch { /* selected anyway — saving is a convenience, not the send */ }
  };

  const add = async () => { await addId(newId, newLabel); setNewId(""); setNewLabel(""); setAdding(false); };

  /**
   * A list of people, straight into the recipients. Every number is taken as
   * given: checking seventy-six against WhatsApp one by one is itself a way to
   * get the number rate-limited, and one that isn't on WhatsApp simply fails at
   * send time and says so in the history.
   *
   * These are not saved to the reusable list — a one-off import of a few hundred
   * numbers would bury the handful of chats people actually pick from.
   */
  const addFile = async (f: File) => {
    setErr(null);
    const rows = parseWaRows(await f.text());
    if (!rows.length) { setErr("No phone numbers in that file. Each line needs a number, with the name beside it."); return; }
    const have = new Set(selected.map((s) => s.id));
    const fresh = rows
      .filter((r) => !have.has(r.phone))
      .map((r) => ({ id: r.phone, label: r.name || chatDisplay(r.phone), kind: chatKind(r.phone) }));
    if (!fresh.length) { setErr(`All ${rows.length} of those are already in the list.`); return; }
    onChange([...selected, ...fresh]);
    setErr(null);
    setImported({ added: fresh.length, skipped: rows.length - fresh.length });
  };

  const forget = async (id: string) => {
    await fetch(`/api/scheduler/whatsapp/recipients?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    load();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Send to</label>
        <label className="ml-auto text-[12px] text-brand hover:underline inline-flex items-center gap-1 cursor-pointer">
          <IconUpload size={13} stroke={2} /> Upload a CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await addFile(f); }} />
        </label>
        <button type="button" onClick={() => setAdding((a) => !a)}
          className="text-[12px] text-brand hover:underline inline-flex items-center gap-1">
          <IconPlus size={13} stroke={2} /> Add a number or group
        </button>
      </div>

      {(imported || (err && !adding)) && (
        <div className={`text-[12px] rounded-lg px-3 py-2 mb-2 border ${imported ? "bg-brand-light/50 border-brand-light text-brand-dark" : "bg-rose-50 border-rose-100 text-rose-700"}`}>
          {imported
            ? <>Added <b>{imported.added}</b> {imported.added === 1 ? "person" : "people"} from that file{imported.skipped ? `, ${imported.skipped} already in the list` : ""}. They aren&apos;t checked against WhatsApp — any number without an account simply fails and says so afterwards.</>
            : err}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((r) => (
            <span key={r.id} title={r.id} className="inline-flex items-center gap-1 bg-brand-light text-brand-dark rounded-full pl-2.5 pr-1.5 py-1 text-[12px]">
              {r.label}
              <button type="button" onClick={() => toggle(r)} className="text-brand/60 hover:text-brand-dark" aria-label={`Remove ${r.label}`}>
                <IconX size={13} stroke={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="border border-gray-200 rounded-xl p-3 mb-2 bg-[#F6F7FB]">
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="+91 88928 69798 or 1203…@g.us"
              className="flex-1 rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Name (optional)"
              className="sm:w-44 rounded-lg border border-gray-200 focus:border-brand outline-none p-2 text-[13px] text-[#232D42]" />
            <button type="button" onClick={add}
              className="rounded-lg bg-brand text-white text-[13px] font-medium px-3 py-2 hover:bg-brand-dark">Add</button>
          </div>
          {err && <div className="text-[12px] text-[#C03221] mt-1.5">{err}</div>}
          <div className="text-[11.5px] text-[#8A92A6] mt-1.5">
            A community goes to its Announcements group — paste that group&apos;s id, and the linked number has to be an admin of it.
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100">
          <IconSearch size={15} stroke={1.8} className="text-[#8A92A6]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or type a number…"
            className="flex-1 outline-none text-[13px] text-[#232D42] bg-transparent" />
        </div>
        <div className="flex gap-1 px-2.5 py-2 border-b border-gray-100">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)}
              className={`text-[12px] font-medium rounded-lg px-2.5 py-1 border transition ${kind === k.key ? "bg-brand-light text-brand-dark border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-gray-300"}`}>
              {k.label}
            </button>
          ))}
        </div>

        <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
          {typed && (
            <button type="button" disabled={typedState === "checking" || typedState === "no"}
              onClick={() => { addId(typed.id); setQ(""); }}
              title={typedState === "no" ? "This number isn't on WhatsApp" : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-gray-50 ${typedState === "no" ? "opacity-60 cursor-not-allowed" : "hover:bg-[#F6F7FB]"}`}>
              <span className={`w-4 h-4 rounded border border-dashed grid place-items-center flex-shrink-0 ${typedState === "no" ? "border-[#C03221] text-[#C03221]" : "border-brand text-brand"}`}>
                {typedState === "no" ? <IconX size={11} stroke={2.5} /> : <IconPlus size={11} stroke={2.5} />}
              </span>
              <Avatar r={typed} />
              <span className="min-w-0">
                <span className="block text-[13px] text-[#232D42] truncate">
                  {typedState === "no" ? typed.label : `Send to ${typed.label}`}
                </span>
                <span className={`block text-[11.5px] truncate ${typedState === "no" ? "text-[#C03221]" : "text-[#8A92A6]"}`}>
                  {typedState === "checking" ? "Checking WhatsApp…"
                    : typedState === "yes" ? "On WhatsApp — click to add"
                    : typedState === "no" ? "Not on WhatsApp. They'd have to be invited to it first."
                    : "Click to add — couldn't check whether it's on WhatsApp"}
                </span>
              </span>
            </button>
          )}
          {list === null ? (
            <div className="px-3 py-6 text-[13px] text-[#8A92A6] text-center">Loading…</div>
          ) : shown.length === 0 && !typed ? (
            <div className="px-3 py-6 text-[13px] text-[#8A92A6] text-center">
              {list.length === 0 ? "No saved recipients yet — add a number or group above." : "Nothing matches that search."}
            </div>
          ) : shown.length === 0 ? null : shown.map((r) => (
            <div key={r.id} className={`flex items-center gap-2.5 px-3 py-2 ${isOn(r.id) ? "bg-brand-light/40" : "hover:bg-[#F6F7FB]"}`}>
              <button type="button" onClick={() => toggle(r)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                <span className={`w-4 h-4 rounded border grid place-items-center flex-shrink-0 ${isOn(r.id) ? "bg-brand border-brand text-white" : "border-gray-300"}`}>
                  {isOn(r.id) && <IconCheck size={11} stroke={3} />}
                </span>
                <Avatar r={r} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-[#232D42] truncate">{r.label}</span>
                  <span className="block text-[11.5px] text-[#8A92A6] truncate">{chatDisplay(r.id)}</span>
                </span>
              </button>
              <button type="button" onClick={() => forget(r.id)} title="Remove from the saved list"
                className="text-gray-300 hover:text-[#C03221] flex-shrink-0"><IconX size={14} stroke={2} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[11.5px] text-[#8A92A6] mt-1.5">
        When you add multiple recipients, the message is scheduled individually for each one.
        {!synced && <> The live WhatsApp contact list isn&apos;t connected yet, so this shows the chats you&apos;ve saved.</>}
      </div>
    </div>
  );
}
