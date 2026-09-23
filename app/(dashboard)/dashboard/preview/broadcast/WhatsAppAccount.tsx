"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBrandWhatsapp, IconAlertTriangle, IconClock,
  IconPlugConnectedX, IconRefresh, IconCopy, IconCheck, IconPlus,
} from "@tabler/icons-react";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { prettyPhone, type WaAccount } from "@/lib/whatsapp-session";

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

  return (
    <div className="rounded-xl border border-gray-100 bg-white mb-2">
      {accounts === null && <div className="px-3 py-2.5 text-[12.5px] text-[#8A92A6]">Checking accounts…</div>}

      {accounts?.length === 0 && phase.at === "idle" && (
        <div className="px-3 py-2.5">
          <div className="text-[12.5px] font-medium text-[#232D42]">No number linked</div>
          <div className="text-[11.5px] text-[#8A92A6]">Nothing can send until one is.</div>
        </div>
      )}

      {accounts?.map((a, i) => (
        <div key={a.name} className={`flex items-center gap-2 px-2.5 py-2.5 ${i ? "border-t border-gray-100" : ""}`}>
          <span className="w-7 h-7 rounded-full bg-[#25D366]/10 grid place-items-center flex-shrink-0">
            <IconBrandWhatsapp size={18} className="text-[#25D366]" stroke={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[a.status] || DOT.UNKNOWN}`} />
              <span className="text-[12.5px] font-medium text-[#232D42] truncate">
                {prettyPhone(a.phone) || a.name}
              </span>
            </div>
            <div className="text-[11.5px] text-[#8A92A6] truncate">
              {a.label || (a.status === "WORKING" ? "Linked" : a.status.toLowerCase().replace(/_/g, " "))}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* A working account needs no button — unlink it, or use Add a number.
                A dropped one does: relinking here keeps its name, so anything already
                queued from it still knows where to go. */}
            {a.status !== "WORKING" && (
              <button onClick={() => openPanel(a.name)}
                className="text-[11.5px] font-medium rounded-md border border-gray-200 px-1.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand">
                Link
              </button>
            )}
            <button onClick={() => disconnect(a)} disabled={busy} title="Unlink this number"
              className="w-6 h-6 grid place-items-center rounded-md text-[#8A92A6] hover:text-[#C03221] hover:bg-[#F6F7FB] disabled:opacity-50">
              <IconPlugConnectedX size={13} />
            </button>
          </div>
        </div>
      ))}

      {accounts !== null && phase.at === "idle" && (
        <div className="border-t border-gray-100 px-2.5 py-2 flex items-center gap-2">
          <button onClick={() => openPanel()} className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline">
            <IconPlus size={13} /> Add a number
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
