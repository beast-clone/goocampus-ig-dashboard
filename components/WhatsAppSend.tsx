"use client";
import { useEffect, useRef, useState } from "react";
import { IconBrandWhatsapp, IconChevronDown, IconAlertTriangle } from "@tabler/icons-react";

// One-click WhatsApp for a lead.
//
// Opens WhatsApp with the message already written; a person reads it and presses
// send. Nothing is sent automatically, which is the point — it replaces the
// copy-the-number-out-and-build-a-campaign dance without handing a machine the
// ability to message a customer.
//
// It sends from whichever number that device's WhatsApp is signed into, which is
// exactly "the number we called from". A wa.me link cannot carry a file, so the
// message that needs the brochure links to it instead; attaching a real PDF
// needs the business number and a template, which is a separate path.

export type WaMessage = {
  key: string;
  label: string;
  hint: string;
  /** Empty string = open the chat with nothing typed. */
  body: (ctx: { name: string }) => string;
};

// Edit these and every send changes. Kept short deliberately: long WhatsApp
// messages get skimmed, and the detail belongs behind the link.
export const DEFAULT_MESSAGES: WaMessage[] = [
  {
    key: "confirm",
    label: "Confirmation",
    hint: "Short — confirms we spoke and what happens next.",
    body: ({ name }) =>
      `Hi ${name || "there"}, thanks for speaking with us at GooCampus. ` +
      `We've noted your interest and I'll follow up with the next steps shortly.`,
  },
  {
    key: "details",
    label: "Send details",
    hint: "Longer, with a link to the full details.",
    body: ({ name }) =>
      `Hi ${name || "there"}, thanks for your interest in GooCampus. ` +
      `Here are the full details, including eligibility, fees and dates: https://goocampusevents.com\n\n` +
      `Happy to answer anything over a call.`,
  },
  { key: "blank", label: "Write my own", hint: "Opens the chat with nothing typed.", body: () => "" },
];

// India's mobile numbers are ten digits starting 6-9. This matters more than it
// looks: the CRM prepends +91 to foreign numbers, which turns a UK or Gulf number
// into a perfectly valid-looking Indian one belonging to a stranger. A number that
// fails this check still sends — the human may know better — but it says so first.
function normalise(raw: string): { e164: string; suspect: string | null } {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return { e164: "", suspect: "No phone number on this lead." };

  let e164 = digits;
  if (digits.length === 10) e164 = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) e164 = `91${digits.slice(1)}`;

  if (e164.startsWith("91") && e164.length === 12) {
    const national = e164.slice(2);
    if (!/^[6-9]/.test(national)) {
      return { e164, suspect: "This is stored as an Indian number but doesn't start 6–9. It may be a foreign number with +91 added by mistake — check before sending." };
    }
    return { e164, suspect: null };
  }
  if (e164.length < 8 || e164.length > 15) {
    return { e164, suspect: `That's ${e164.length} digits — too ${e164.length < 8 ? "short" : "long"} to be a phone number.` };
  }
  return { e164, suspect: null };
}

export function WhatsAppSend({
  phone, name, messages = DEFAULT_MESSAGES, compact,
}: {
  phone: string;
  name: string;
  messages?: WaMessage[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { e164, suspect } = normalise(phone);

  // Click-away and Escape, so a menu left open on one row doesn't follow you.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const send = (m: WaMessage) => {
    const text = m.body({ name });
    // web.whatsapp.com on a desktop, the app on a phone — WhatsApp decides.
    const url = `https://wa.me/${e164}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
    window.open(url, "_blank", "noopener");
    setOpen(false);
  };

  if (!e164) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#C9CDD8] px-2.5 py-1.5" title="No phone number on this lead">
        <IconBrandWhatsapp size={14} stroke={1.8} /> —
      </span>
    );
  }

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border whitespace-nowrap transition-colors ${
          compact ? "px-2 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]"
        } ${suspect
          ? "border-[#F0DFB8] bg-[#FDF6E7] text-[#B7791F] hover:border-[#B7791F]"
          : "border-gray-200 text-[#4A5468] hover:border-[#25D366] hover:text-[#128C4A]"}`}
      >
        <IconBrandWhatsapp size={14} stroke={1.8} className={suspect ? "" : "text-[#25D366]"} />
        WhatsApp
        <IconChevronDown size={12} stroke={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-[300px] bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#FCFCFE] border-b border-gray-100">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#A6ACBE]">Opens WhatsApp — you press send</div>
            <div className="text-[11px] text-[#8A92A6] mt-0.5">
              Goes to +{e164} from whichever number this device is signed into.
            </div>
          </div>

          {suspect && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 bg-[#FDF6E7] border-b border-[#F0DFB8]">
              <IconAlertTriangle size={14} stroke={1.9} className="text-[#B7791F] shrink-0 mt-[1px]" />
              <span className="text-[11.5px] leading-snug text-[#7A5410]">{suspect}</span>
            </div>
          )}

          {messages.map((m) => (
            <button key={m.key} onClick={() => send(m)}
              className="block w-full text-left px-3.5 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-brand-light">
              <div className="text-[13px] font-medium text-[#232D42]">{m.label}</div>
              <div className="text-[11.5px] text-[#8A92A6] mt-0.5 leading-snug">{m.hint}</div>
            </button>
          ))}

          <div className="px-3.5 py-2 bg-[#FCFCFE] border-t border-gray-100 text-[10.5px] text-[#A6ACBE] leading-snug">
            Nothing sends until you press send in WhatsApp. A link can&apos;t attach a file — the
            details message links to them instead.
          </div>
        </div>
      )}
    </div>
  );
}
