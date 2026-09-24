"use client";
import { useState } from "react";
import {
  IconX, IconSend, IconClock, IconUsers, IconUser, IconPencil, IconTrash, IconPaperclip,
} from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import type { Recipient } from "./RecipientPicker";

// The last look before a batch leaves the number.
//
// Up to this point the composer shows one preview and a count — fine for one
// message, useless for forty, and worse once each person's wording differs. So
// nothing is queued until every line has been seen: who it goes to, the exact
// text they will read, and the exact minute it goes.
//
// Everything here is still editable, because seeing the list is the moment you
// notice a line that reads wrong or a name that shouldn't be on it.

export type ReviewRow = {
  chat: Recipient;
  body: string;
  at: string;          // ISO
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });

export function ReviewModal({ rows: initial, imageName, onClose, onConfirm, busy }: {
  rows: ReviewRow[];
  /** The attachment, named once at the top — it is the same file on every row. */
  imageName?: string | null;
  onClose: () => void;
  onConfirm: (rows: ReviewRow[]) => void;
  busy: boolean;
}) {
  const [rows, setRows] = useState<ReviewRow[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);

  const drop = (id: string) => setRows((rs) => rs.filter((r) => r.chat.id !== id));
  const setBody = (id: string, body: string) =>
    setRows((rs) => rs.map((r) => (r.chat.id === id ? { ...r, body } : r)));

  const groups = rows.filter((r) => r.chat.kind !== "contact").length;
  const people = rows.length - groups;
  const last = rows.length ? rows.map((r) => r.at).sort().slice(-1)[0] : null;

  return (
    <Overlay onClose={busy ? () => {} : onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="preview-scope w-full max-w-[860px] my-6 bg-white rounded-2xl border border-gray-100 flex flex-col max-h-[86vh]">

        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center"><IconSend size={17} /></span>
          <div>
            <div className="text-[15px] font-medium text-[#232D42]">Before this goes out</div>
            <div className="text-[12px] text-[#8A92A6]">
              {rows.length} message{rows.length === 1 ? "" : "s"}
              {people && groups ? ` — ${people} to people, ${groups} to ${groups === 1 ? "a group" : "groups"}` : ""}
              {last && rows.length > 1 ? ` · the last one at ${fmtTime(last)}` : ""}
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="ml-auto text-gray-400 hover:text-[#232D42] disabled:opacity-40" aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        {imageName && (
          <div className="flex items-center gap-2 px-5 py-2 bg-[#F6F7FB] border-b border-gray-100 text-[12.5px] text-[#4A5468]">
            <IconPaperclip size={14} className="text-[#8A92A6]" /> The same file goes with every one of these — <b className="font-medium">{imageName}</b>
          </div>
        )}

        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.chat.id} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-6 h-6 rounded-lg grid place-items-center flex-shrink-0 ${r.chat.kind === "contact" ? "bg-[#F6F7FB] text-[#8A92A6]" : "bg-brand-light text-brand"}`}>
                  {r.chat.kind === "contact" ? <IconUser size={13} /> : <IconUsers size={13} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[#232D42] truncate">{r.chat.label}</span>
                  {/* Two groups can carry the same name — a Community and its
                      Announcements both do — so the id is here to tell them apart. */}
                  {r.chat.kind !== "contact" && r.chat.label !== r.chat.id && (
                    <span className="block text-[11px] text-[#8A92A6] truncate">{r.chat.id}</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] text-[#8A92A6] whitespace-nowrap">
                  <IconClock size={13} /> {fmtTime(r.at)}
                </span>
                <button onClick={() => setEditing(editing === r.chat.id ? null : r.chat.id)} disabled={busy}
                  className="ml-auto text-[12px] text-[#8A92A6] hover:text-brand inline-flex items-center gap-1 disabled:opacity-40">
                  <IconPencil size={13} /> {editing === r.chat.id ? "Done" : "Edit"}
                </button>
                <button onClick={() => drop(r.chat.id)} disabled={busy}
                  title="Don't send this one"
                  className="text-[12px] text-[#8A92A6] hover:text-[#C03221] inline-flex items-center gap-1 disabled:opacity-40">
                  <IconTrash size={13} />
                </button>
              </div>
              {editing === r.chat.id ? (
                <textarea value={r.body} onChange={(e) => setBody(r.chat.id, e.target.value)} rows={4} autoFocus
                  className="w-full rounded-xl border border-brand outline-none p-3 text-[13px] text-[#232D42] resize-y" />
              ) : (
                <div className="rounded-xl border border-gray-100 px-3 py-2 text-[13px] text-[#4A5468] whitespace-pre-wrap">
                  {r.body || <span className="text-[#8A92A6] italic">No text — the file goes on its own.</span>}
                </div>
              )}
            </div>
          ))}
          {!rows.length && (
            <div className="px-5 py-10 text-center text-[13px] text-[#8A92A6]">
              Nothing left to send — every line has been taken off.
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2">
          <span className="text-[12px] text-[#8A92A6]">
            Nothing has been queued yet. Closing this loses none of your message.
          </span>
          <button onClick={onClose} disabled={busy}
            className="ml-auto text-[13px] text-[#4A5468] px-3 py-2 rounded-xl hover:bg-[#F6F7FB] disabled:opacity-50">
            Back
          </button>
          <button onClick={() => onConfirm(rows)} disabled={busy || !rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
            <IconSend size={15} /> {busy ? "Queueing…" : `Queue all ${rows.length}`}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
