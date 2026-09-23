"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBrandWhatsapp, IconAlertTriangle, IconClock,
  IconPlugConnectedX, IconRefresh, IconCopy, IconCheck, IconPlus,
} from "@tabler/icons-react";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { prettyPhone, type WaAccount } from "@/lib/whatsapp-session";
import { resolveSendFrom, setSendFrom, SEND_FROM_CHANGED } from "./sendFrom";

// Which WhatsApp number Community Broadcast sends from, and how to change it.
//
// Linking uses a pairing code rather than a QR: a QR lives ~20 seconds and dies
// after six refreshes, which is not long enough to walk to the handset. The code
// lasts minutes, needs no camera, and can be read out to whoever is holding it.

type Phase =
  | { at: "idle" }
  // `session` is the account being (re)linked; undefined means a brand new one.
  | { at: "asking"; session?: string }
  | { at: "pairing"; code: string; phone: string; session: string }
  | { at: "error"; message: string };

const DOT: Record<string, string> = {
  WORKING: "bg-emerald-500",
  SCAN_QR_CODE: "bg-amber-400",
  STARTING: "bg-amber-400",
  STOPPED: "bg-gray-300",
  FAILED: "bg-rose-500",
  UNKNOWN: "bg-gray-300",
};

/**
 * Live status, at the end of the row.
 *
 * A connected number breathes — the ring is the only moving thing on the page, so
 * it reads as "this is live right now" rather than a colour you have to decode.
 * Anything not connected sits still, which is the point: stillness is the warning.
 */
function StatusDot({ status }: { status: string }) {
  const colour = DOT[status] || DOT.UNKNOWN;
  const live = status === "WORKING";
  return (
    <span className="relative flex items-center justify-center w-3 h-3 flex-shrink-0 self-center" title={live ? "Connected" : status.toLowerCase().replace(/_/g, " ")}>
      {live && <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${colour}`} />}
      <span className={`relative inline-flex w-3 h-3 rounded-full ${colour}`} />
    </span>
  );
}

export function WhatsAppAccount() {
  const [accounts, setAccounts] = useState<WaAccount[] | null>(null);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not read the accounts");
      const list = (d.accounts || []) as WaAccount[];
      setAccounts(list);
      return list;
    } catch (e) {
      setAccounts([]);
      setPhase({ at: "error", message: (e as Error).message });
      return [];
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a code is outstanding, keep asking — the moment the phone accepts it the
  // account turns green without anyone refreshing.
  useEffect(() => {
    if (phase.at !== "pairing") return;
    const target = phase.session;
    const tick = async () => {
      const list = await load();
      if (list.some((a) => a.name === target && a.status === "WORKING")) { setPhase({ at: "idle" }); return; }
      pollRef.current = setTimeout(tick, 4000);
    };
    pollRef.current = setTimeout(tick, 4000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [phase, load]);

  const connect = async (session?: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "connect", phone: input, session }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not start linking");
      setPhase({ at: "pairing", code: d.code, phone: d.phone, session: d.session });
    } catch (e) {
      setPhase({ at: "error", message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const disconnect = async (a: WaAccount) => {
    const ok = await confirmDialog({
      title: `Unlink ${prettyPhone(a.phone) || a.name}?`,
      body: "Messages queued from this number stop going out until it is linked again. Nothing already sent is affected, and nothing in the queue is deleted.",
      action: "Unlink", danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "disconnect", session: a.name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not unlink");
      setPhase({ at: "idle" });
      await load();
    } catch (e) {
      setPhase({ at: "error", message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const copy = () => {
    if (phase.at !== "pairing") return;
    navigator.clipboard?.writeText(phase.code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const openPanel = (session?: string) => { setPhase({ at: "asking", session }); setInput(""); };

  // Which of these numbers new messages go out from. Re-read on change so the
  // pill follows a switch made in the composer too.
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(SEND_FROM_CHANGED, on);
    return () => window.removeEventListener(SEND_FROM_CHANGED, on);
  }, []);
  const sending = resolveSendFrom(accounts || []);

  return (
    <div className="rounded-xl border border-gray-100 bg-white mb-2">
      <div className="px-3 pt-3 pb-1 text-[11.5px] uppercase tracking-wide text-[#8A92A6] font-semibold">
        Connected numbers
      </div>
      {accounts === null && <div className="px-3 pb-2.5 text-[12.5px] text-[#8A92A6]">Checking…</div>}

      {accounts?.length === 0 && phase.at === "idle" && (
        <div className="px-3 py-2.5">
          <div className="text-[12.5px] font-medium text-[#232D42]">No number linked</div>
          <div className="text-[11.5px] text-[#8A92A6]">Nothing can send until one is.</div>
        </div>
      )}

      {accounts?.map((a, i) => (
        <div key={a.name} onClick={() => a.status === "WORKING" && setSendFrom(a.name)}
          title={a.status === "WORKING" ? (sending?.name === a.name ? "Messages are sent from this number" : "Send from this number instead") : undefined}
          className={`group relative flex items-center gap-2.5 px-3 py-3.5 ${i ? "border-t border-gray-100" : ""} ${a.status === "WORKING" && sending?.name !== a.name ? "cursor-pointer hover:bg-[#F6F7FB]" : ""}`}>
          <span className="relative w-10 h-10 rounded-full bg-[#25D366]/10 grid place-items-center flex-shrink-0">
            <IconBrandWhatsapp size={25} className="text-[#25D366]" stroke={2} />
            {/* Which number sends. A badge on the avatar: in the row itself it
               took width and truncated the number (Praveen, 23 Sep). */}
            {sending?.name === a.name && (
              <span title="Messages are sent from this number"
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand text-white grid place-items-center ring-2 ring-white">
                <IconCheck size={10} stroke={3} />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-[#232D42] truncate leading-tight">
              {prettyPhone(a.phone) || a.name}
              {/* Which number sends. A tick, not a pill — a badge on every row
                  made the panel unreadable. Clicking a linked row moves it. */}
            </div>
            <div className="text-[13px] text-[#8A92A6] truncate">
              {a.label || (a.status === "WORKING" ? "Linked" : a.status.toLowerCase().replace(/_/g, " "))}
            </div>
          </div>
          <StatusDot status={a.status} />
          {/* A dropped account keeps its Link button in the flow — you need to see it.
              Unlink does not: it is rare, and its 24px is the difference between the
              number fitting and being cut off. */}
          {a.status !== "WORKING" && (
            <button onClick={() => openPanel(a.name)}
              className="text-[11.5px] font-medium rounded-md border border-gray-200 px-1.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand flex-shrink-0">
              Link
            </button>
          )}
          <button onClick={() => disconnect(a)} disabled={busy} title="Unlink this number"
            className="w-7 h-7 grid place-items-center rounded-md text-[#8A92A6] flex-shrink-0 transition hover:text-[#C03221] hover:bg-[#F6F7FB] disabled:opacity-50">
            <IconPlugConnectedX size={15} />
          </button>
        </div>
      ))}

      {accounts !== null && phase.at === "idle" && (
        <div className="border-t border-gray-100 px-2.5 py-2 flex items-center gap-2">
          <button onClick={() => openPanel()} className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
            <IconPlus size={14} /> Add a number
          </button>
          <button onClick={() => load()} title="Re-check"
            className="ml-auto w-6 h-6 grid place-items-center rounded-md text-[#8A92A6] hover:text-[#232D42] hover:bg-[#F6F7FB]">
            <IconRefresh size={13} />
          </button>
        </div>
      )}

      {/* Entering a number */}
      {phase.at === "asking" && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <div className="text-[11.5px] text-[#8A92A6] mb-1">
            {phase.session ? "Link a different number to this account" : "Link another WhatsApp number"}
          </div>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) connect(phase.session); }}
            placeholder="Phone number with country code" autoFocus
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-[#232D42] outline-none focus:border-brand"
          />
          <div className="text-[11px] text-[#8A92A6] mt-1">
            A 10-digit number is treated as Indian. For anywhere else, start with the country code.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => connect(phase.session)} disabled={busy || !input.trim()}
              className="rounded-lg bg-brand text-white text-[12px] font-medium px-3 py-1.5 hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Getting a code…" : "Get pairing code"}
            </button>
            <button onClick={() => setPhase({ at: "idle" })} className="text-[12px] text-[#8A92A6] hover:text-[#232D42]">Cancel</button>
          </div>
        </div>
      )}

      {/* Code issued — the phone's turn */}
      {phase.at === "pairing" && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <div className="text-[11.5px] text-[#8A92A6] mb-1">Enter this on {prettyPhone(phase.phone)}</div>
          <div className="flex items-center gap-2">
            <code className="text-[19px] font-semibold tracking-[0.18em] text-[#232D42]">{phase.code}</code>
            <button onClick={copy} title="Copy" className="text-[#8A92A6] hover:text-brand">
              {copied ? <IconCheck size={14} className="text-emerald-600" /> : <IconCopy size={14} />}
            </button>
          </div>
          <ol className="text-[11.5px] text-[#4A5468] mt-2 space-y-0.5 list-decimal list-inside">
            <li>WhatsApp → ⋮ → Linked devices</li>
            <li>Link a device → <b>Link with phone number instead</b></li>
            <li>Type the code above</li>
          </ol>
          <div className="flex items-center gap-1.5 text-[11.5px] text-amber-700 mt-2">
            <IconClock size={12} /> Waiting for the phone…
          </div>
          <button onClick={() => setPhase({ at: "idle" })} className="text-[11.5px] text-[#8A92A6] hover:text-[#232D42] mt-1.5">Cancel</button>
        </div>
      )}

      {phase.at === "error" && (
        <div className="border-t border-gray-100 px-3 py-2 flex items-start gap-1.5 text-[11.5px] text-[#C03221]">
          <IconAlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0">{phase.message}</span>
        </div>
      )}
    </div>
  );
}
