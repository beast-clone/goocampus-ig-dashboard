"use client";
import { useEffect, useMemo, useState } from "react";
import {
  IconUsers, IconX, IconCopy, IconCheck, IconLink, IconUserPlus, IconSend,
  IconAlertTriangle, IconCircleCheck, IconMail, IconUpload,
} from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { LoadingBlock } from "@/components/LoadingBlock";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { prettyPhone } from "@/lib/whatsapp-session";
import { parseWaRows } from "@/lib/whatsapp";
import type { Recipient } from "./RecipientPicker";

// Who is in a group, its invite link, and adding people to it.
//
// Two ways in, because they are genuinely different things:
//   · the invite link — they join themselves, which is consent you can point to,
//     and nothing WhatsApp does can block it
//   · adding directly — faster, but WhatsApp lets people refuse it, and adding a
//     crowd of strangers is one of the documented ways to lose the number
//
// So adds are checked, batched and spaced by the API, and every number gets an
// honest line back: added, already in, invited instead, or not on WhatsApp.

type Member = { id: string; phone: string | null; admin: boolean };
type Result = { id: string; state: string; text: string };

/** Numbers per request. Each one is checked against WhatsApp, then added. */
const BATCH = 5;

export function GroupMembers({ session, sessionPhone, groups, onClose, onMessageGroup }: {
  session: string;
  /** The sending number, so the panel can tell whether it is an admin here. */
  sessionPhone?: string | null;
  /** null while they are still being read. */
  groups: Recipient[] | null;
  onClose: () => void;
  /** Hand a group to the composer, so "send" lives in one place. */
  onMessageGroup: (g: Recipient) => void;
}) {
  const [picked, setPicked] = useState<Recipient | null>(groups?.[0] || null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [numbers, setNumbers] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** "12 of 76" while a long add is working through its batches. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // The panel can be opened before the groups have arrived, so the first one is
  // chosen when they do, not only at mount.
  useEffect(() => {
    if (!picked && groups?.length) setPicked(groups[0]);
  }, [groups, picked]);

  useEffect(() => {
    if (!picked) return;
    setMembers(null); setLink(null); setResults(null); setErr(null);
    fetch(`/api/scheduler/whatsapp/group?groupId=${encodeURIComponent(picked.id)}&session=${encodeURIComponent(session)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setErr(d.error); setMembers([]); return; }
        setMembers(d.participants || []); setLink(d.inviteLink || null);
      })
      .catch((e) => { setErr((e as Error).message); setMembers([]); });
  }, [picked, session]);

  // Whether the sending number is an admin here. WhatsApp only gives an invite
  // link to an admin, and most groups only let admins add people — so saying
  // this plainly is kinder than letting someone press Add all and watch it fail.
  const me = useMemo(
    () => (sessionPhone && members ? members.find((m) => m.phone === sessionPhone) : null) || null,
    [members, sessionPhone],
  );
  const notAdmin = !!me && !me.admin;

  const rows = useMemo(() => parseWaRows(numbers), [numbers]);
  const parsed = useMemo(() => rows.map((r) => r.phone), [rows]);
  const named = useMemo(() => rows.filter((r) => r.name).length, [rows]);

  const addAll = async () => {
    if (!picked || !parsed.length) return;
    const ok = await confirmDialog({
      title: `Add ${parsed.length} ${parsed.length === 1 ? "person" : "people"} to ${picked.label}?`,
      body: (
        <>
          Each number is checked against WhatsApp first, then added a few at a time with a pause —
          adding a crowd at once is one of the ways a number gets banned.
          <div className="mt-2">Anyone who doesn&apos;t allow being added gets a private invite from WhatsApp instead.</div>
          {notAdmin && (
            <div className="mt-2">
              This number isn&apos;t an admin of {picked.label}. Many groups only let admins add people,
              so these may all come back refused.
            </div>
          )}
        </>
      ),
      action: "Add them",
    });
    if (!ok) return;

    // Five per request, not seventy-six. The server checks each number and then
    // adds them, so one big call runs for minutes and is cut off by the host
    // long before it finishes. Small calls also mean the results appear as they
    // happen instead of after a three-minute wait.
    setBusy(true); setErr(null); setResults([]); setProgress({ done: 0, total: parsed.length });
    const all: Result[] = [];
    try {
      for (let i = 0; i < parsed.length; i += BATCH) {
        const slice = parsed.slice(i, i + BATCH);
        const d = await fetch("/api/scheduler/whatsapp/group", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ groupId: picked.id, phones: slice, session }),
        }).then((r) => r.json());
        if (d.error) throw new Error(d.error);
        all.push(...((d.results || []) as Result[]));
        if (d.inviteLink) setLink(d.inviteLink);
        setResults([...all]);
        setProgress({ done: Math.min(i + BATCH, parsed.length), total: parsed.length });
        // A gap between batches, for the same reason the server pauses inside one.
        if (i + BATCH < parsed.length) await new Promise((r) => setTimeout(r, 4000));
      }
      setNumbers("");
      // refresh the member list so the count is honest
      fetch(`/api/scheduler/whatsapp/group?groupId=${encodeURIComponent(picked.id)}&session=${encodeURIComponent(session)}`, { cache: "no-store" })
        .then((r) => r.json()).then((g) => setMembers(g.participants || [])).catch(() => {});
    } catch (e) {
      // Whatever got through stays on screen: those people really were added.
      setErr(`${(e as Error).message}${all.length ? ` — ${all.length} of ${parsed.length} were done before this` : ""}`);
    }
    finally { setBusy(false); setProgress(null); }
  };

  // Inviting is the gentler of the two: it queues a normal message carrying the
  // link, which means it is paced and warned about like any other send.
  const sendInvites = async () => {
    if (!picked || !link || !parsed.length) return;
    const ok = await confirmDialog({
      title: `Send the invite link to ${parsed.length} ${parsed.length === 1 ? "person" : "people"}?`,
      body: <>They get a message with the link to {picked.label} and join themselves. Queued 5–10 minutes apart, so the last one goes about {Math.round((parsed.length - 1) * 7.5)} minutes after the first.</>,
      action: "Queue the invites",
    });
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      const bodies: Record<string, string> = {};
      for (const r of rows) {
        bodies[r.phone] = `${r.name ? `Hi ${r.name}, ` : "Hi, "}you're invited to join *${picked.label}* on WhatsApp.\n\n${link}`;
      }
      const d = await fetch("/api/scheduler/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          kind: "message", session,
          chats: rows.map((r) => ({ id: r.phone, label: r.name || null })),
          body: `You're invited to join ${picked.label} on WhatsApp.\n\n${link}`,
          bodies,
          scheduleTimeISO: new Date().toISOString(),
        }),
      }).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      setResults(rows.map((r) => ({ id: r.phone, state: "invited", text: `Invite queued${r.name ? ` for ${r.name}` : ""}` })));
      setNumbers("");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const tone = (s: string) =>
    s === "added" ? "text-[#2F9E6F]" : s === "already" ? "text-[#8A92A6]" : s === "invited" ? "text-amber-700" : "text-[#C03221]";

  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="preview-scope w-full max-w-[760px] my-6 bg-white rounded-2xl border border-gray-100 flex flex-col max-h-[86vh]">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center"><IconUsers size={17} /></span>
          <div className="text-[15px] font-medium text-[#232D42]">Groups &amp; members</div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-[#232D42]" aria-label="Close"><IconX size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {groups === null ? (
            <div className="py-8"><LoadingBlock label="Reading your groups…" /></div>
          ) : groups.length === 0 ? (
            <div className="text-[13px] text-[#8A92A6] py-8 text-center">
              No groups on this number yet. A group appears here once this WhatsApp number is in it.
            </div>
          ) : (
            <>
              <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold">Group</label>
              <div className="flex items-center gap-2 mt-1.5 mb-4">
                <PreviewSelect
                  value={picked?.id || ""}
                  onChange={(v) => setPicked((groups || []).find((g) => g.id === v) || null)}
                  options={(groups || []).map((g) => ({ value: g.id, label: g.label }))}
                  placeholder="Pick a group"
                  className="flex-1 min-w-0"
                />
                {picked && (
                  <button onClick={() => onMessageGroup(picked)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-[12.5px] font-medium text-[#4A5468] px-3 py-2 hover:border-brand hover:text-brand whitespace-nowrap">
                    <IconSend size={14} /> Message this group
                  </button>
                )}
              </div>

              {notAdmin && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[12.5px] px-3 py-2.5 mb-4">
                  <IconAlertTriangle size={15} className="mt-[1px] shrink-0" />
                  <span>
                    This number isn&apos;t an <b>admin</b> of {picked?.label}. That means no invite link, and
                    most groups only let admins add people — so <b>Add all</b> may come back refused for
                    everyone. Ask an admin to make {prettyPhone(sessionPhone || null)} an admin, or share the
                    link from your phone instead.
                  </span>
                </div>
              )}

              {/* Invite link — the safe way in */}
              <div className="rounded-xl border border-gray-100 bg-[#F6F7FB] p-3 mb-4">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#232D42] mb-1">
                  <IconLink size={14} className="text-brand" /> Invite link
                </div>
                <div className="text-[11.5px] text-[#8A92A6] mb-2">
                  People joining by this link is consent you can point to, and WhatsApp never blocks it — unlike adding someone directly.
                </div>
                {link ? (
                  <div className="flex items-center gap-2">
                    <input readOnly value={link} className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] text-[#4A5468]" />
                    <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] text-[#4A5468] hover:border-brand hover:text-brand">
                      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <div className="text-[12.5px] text-[#8A92A6]">No link — the sending number has to be an admin of this group to have one.</div>
                )}
              </div>

              {/* Add directly */}
              <label className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold flex items-center gap-1">
                <IconUserPlus size={13} /> Add numbers
              </label>
              <textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={4}
                placeholder={"Name, number — one per line. Or upload a CSV.\nArun, +91 98765 43210\nPriya, 9876543211"}
                className="w-full mt-1.5 rounded-xl border border-gray-200 focus:border-brand outline-none p-3 text-[13px] text-[#232D42] resize-y" />
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <label className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline cursor-pointer">
                  <IconUpload size={13} /> Upload a CSV
                  <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      const text = await f.text();
                      setNumbers((cur) => (cur.trim() ? cur.replace(/\s*$/, "\n") : "") + text);
                    }} />
                </label>
                {rows.length > 0 && (
                  <span className="text-[11.5px] text-[#8A92A6]">
                    {rows.length} number{rows.length === 1 ? "" : "s"}{named ? `, ${named} with a name` : " — no names, so nothing can be personalised"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button onClick={addAll} disabled={busy || !parsed.length || !picked}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
                  <IconSend size={15} /> {progress ? `Adding ${progress.done} of ${progress.total}…` : busy ? "Adding…" : parsed.length ? `Add all ${parsed.length}` : "Add all"}
                </button>
                <button onClick={sendInvites} disabled={busy || !parsed.length || !link}
                  title={!link ? "No invite link for this group" : "Queue the invite link to these numbers"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-[13px] font-medium text-[#4A5468] px-4 py-2 hover:border-brand hover:text-brand disabled:opacity-50">
                  <IconLink size={15} /> Send them the invite link
                </button>
                <span className="text-[11.5px] text-[#8A92A6] w-full">
                  Adding checks each number against WhatsApp first, then adds {BATCH} at a time with a pause
                  between — {parsed.length > BATCH ? `about ${Math.max(1, Math.round(parsed.length / BATCH * 9 / 60))} minute${Math.round(parsed.length / BATCH * 9 / 60) === 1 ? "" : "s"} for ${parsed.length}. ` : ""}
                  Leave this open while it works. Inviting instead queues one message each, 5–10 minutes apart.
                </span>
              </div>

              {err && <div className="text-[12.5px] rounded-lg px-3 py-2 mt-3 bg-rose-50 text-rose-700 border border-rose-100">{err}</div>}

              {results && (
                <div className="mt-4 rounded-xl border border-gray-100">
                  <div className="px-3 py-2 border-b border-gray-100 text-[12.5px] font-medium text-[#232D42]">What happened</div>
                  <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    {results.map((r) => (
                      <div key={r.id} className="flex items-start gap-2 px-3 py-2 text-[12.5px]">
                        <span className={`mt-0.5 flex-shrink-0 ${tone(r.state)}`}>
                          {r.state === "added" ? <IconCircleCheck size={14} /> : r.state === "invited" ? <IconMail size={14} /> : r.state === "already" ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                        </span>
                        <span className="text-[#232D42] w-36 flex-shrink-0">{prettyPhone(r.id.split("@")[0]) || r.id}</span>
                        <span className={tone(r.state)}>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Who is in it */}
              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-1.5">
                  Members {members ? `(${members.length})` : ""}
                </div>
                {members === null ? <div className="py-6"><LoadingBlock label="Reading the group…" /></div>
                  : members.length === 0 ? <div className="text-[12.5px] text-[#8A92A6] py-3">No members read back for this group.</div>
                  : (
                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                          <span className="text-[#232D42]">{prettyPhone(m.phone) || m.id.split("@")[0]}</span>
                          {m.admin && <span className="text-[11px] rounded-full px-1.5 py-0.5 bg-brand-light text-brand-dark">admin</span>}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
          <button onClick={onClose} className="text-[13px] text-[#4A5468] px-3 py-2 rounded-xl hover:bg-[#F6F7FB]">Close</button>
        </div>
      </div>
    </Overlay>
  );
}
