"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBrandWhatsapp, IconAlertTriangle, IconClock,
  IconPlugConnected, IconPlugConnectedX, IconRefresh, IconCopy, IconCheck,
} from "@tabler/icons-react";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { prettyPhone, type WaSession } from "@/lib/whatsapp-session";

// Which WhatsApp number Community Broadcast sends from, and how to change it.
//
// Linking uses a pairing code rather than a QR: a QR lives ~20 seconds and dies
// after six refreshes, which is not long enough to walk to the handset. The code
// lasts minutes, needs no camera, and can be read out to whoever is holding it.

type Phase =
  | { at: "idle" }
  | { at: "asking" }                                  // typing the number
  | { at: "pairing"; code: string; phone: string }    // code issued, waiting on the phone
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
  const [session, setSession] = useState<WaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not read the account");
      setSession(d.session as WaSession);
      return d.session as WaSession;
    } catch (e) {
      setSession({ status: "UNKNOWN", phone: null, name: null });
      setPhase({ at: "error", message: (e as Error).message });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a code is outstanding, keep asking — the moment the phone accepts it the
  // status flips to WORKING and the panel should say so without anyone refreshing.
  useEffect(() => {
    if (phase.at !== "pairing") return;
    const tick = async () => {
      const s = await load();
      if (s?.status === "WORKING") { setPhase({ at: "idle" }); return; }
      pollRef.current = setTimeout(tick, 4000);
    };
    pollRef.current = setTimeout(tick, 4000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [phase, load]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "connect", phone: input }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not start linking");
      setPhase({ at: "pairing", code: d.code, phone: d.phone });
    } catch (e) {
      setPhase({ at: "error", message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: "Unlink this WhatsApp number?",
      body: "Scheduled messages will stop going out until another number is linked. Nothing already sent is affected, and nothing in the queue is deleted.",
      action: "Unlink",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/scheduler/whatsapp/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "disconnect" }),
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
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const linked = session?.status === "WORKING";

  return (
    <div className="rounded-xl border border-gray-100 bg-[#F6F7FB] px-3 py-2.5 mb-2">
      {/* Who we send as */}
      <div className="flex items-start gap-2">
        <IconBrandWhatsapp size={16} className="text-[#25D366] mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[session?.status || "UNKNOWN"]}`} />
            <span className="text-[12.5px] font-medium text-[#232D42] truncate">
              {loading ? "Checking…" : linked ? prettyPhone(session!.phone) : "No number linked"}
            </span>
          </div>
          {linked && session?.name && (
            <div className="text-[11.5px] text-[#8A92A6] truncate">{session.name}</div>
          )}
          {!loading && !linked && session?.status !== "UNKNOWN" && (
            <div className="text-[11.5px] text-[#8A92A6]">Nothing can send until a number is linked.</div>
          )}
        </div>
        <button onClick={() => load()} title="Re-check" className="text-[#8A92A6] hover:text-[#232D42] flex-shrink-0">
          <IconRefresh size={13} />
        </button>
      </div>

      {/* Actions */}
      {!loading && phase.at !== "pairing" && (
        <div className="mt-2 flex items-center gap-2">
          {linked ? (
            <button onClick={disconnect} disabled={busy}
              className="inline-flex items-center gap-1 text-[12px] text-[#C03221] hover:underline disabled:opacity-50">
              <IconPlugConnectedX size={13} /> Unlink
            </button>
          ) : phase.at === "asking" ? null : (
            <button onClick={() => { setPhase({ at: "asking" }); setInput(""); }}
              className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline">
              <IconPlugConnected size={13} /> Link a number
            </button>
          )}
        </div>
      )}

      {/* Entering the number */}
      {phase.at === "asking" && (
        <div className="mt-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) connect(); }}
            placeholder="Phone number with country code"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-[#232D42] outline-none focus:border-brand bg-white"
          />
          <div className="text-[11px] text-[#8A92A6] mt-1">
            A 10-digit number is treated as Indian. For anywhere else, start with the country code.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={connect} disabled={busy || !input.trim()}
              className="rounded-lg bg-brand text-white text-[12px] font-medium px-3 py-1.5 hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Getting a code…" : "Get pairing code"}
            </button>
            <button onClick={() => setPhase({ at: "idle" })} className="text-[12px] text-[#8A92A6] hover:text-[#232D42]">Cancel</button>
          </div>
        </div>
      )}

      {/* Code issued — now it is the phone's turn */}
      {phase.at === "pairing" && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
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

      {/* Something went wrong */}
      {phase.at === "error" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[#C03221]">
          <IconAlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0">{phase.message}</span>
        </div>
      )}
    </div>
  );
}
