"use client";
import { useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

// Hope-themed custom dropdown (no native <select>). Shared by the Scheduler,
// Marketing Hub calendar, and anywhere else that needs the branded picker.
export function HopeSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; img?: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  // Optional per-option avatar (e.g. real Instagram profile pictures in the
  // account picker). 20px round thumbnail; absent img just renders text-only.
  const Avatar = ({ src }: { src?: string }) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={20} height={20}
        className="w-5 h-5 rounded-full object-cover flex-shrink-0 border border-gray-200"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    ) : null;
  // With a placeholder + no selection, show the placeholder (muted); otherwise the
  // selected option (or the first, matching the original behaviour).
  const label = current?.label ?? (placeholder ?? options[0]?.label);
  const isPlaceholder = !current && !!placeholder;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:border-gray-300 text-gray-800">
        <Avatar src={current?.img} />
        <span className={`whitespace-nowrap ${isPlaceholder ? "text-gray-400" : ""}`}>{label}</span>
        <IconChevronDown size={14} stroke={2} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Inline boxShadow — .hope-scope strips Tailwind shadow-* to none, so the
              menu would otherwise render flat. Inline styles survive the strip. */}
          <div style={{ boxShadow: "0 12px 32px rgba(35,45,66,.16)" }}
            className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-gray-200 rounded-xl p-1 min-w-[190px] max-h-72 overflow-auto">
            {options.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 text-left rounded-lg px-3 py-1.5 text-xs ${o.value === value ? "bg-brand-light/50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}>
                <Avatar src={o.img} />
                <span className="flex-1">{o.label}</span>
                {o.value === value && <IconCheck size={14} stroke={2.5} className="text-brand flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
