"use client";
import React from "react";

// Shared "what's missing" popup.
//
// One place that answers "why did that not go through?". Every surface that
// commits content (My Day, Master sheet, Content Review, Content Studio,
// Scheduler, the create modals) shows THIS instead of failing silently, firing a
// window.alert, or greying a button out with no reason.
//
// The `missing[]` list is server truth: /api/marketing-hub/update and /create
// answer 422 { error, missing, gate } on a completeness gate. Client-side guards
// (scheduler composers) build the same shape so the popup reads identically.
//
// Deliberately styled with inline styles, not classes: My Day's CSS is scoped to
// `.hmd` and the rest of the V2 UI is Tailwind, so neither vocabulary is shared.

export type GateKind = "approve" | "output" | "publish" | "create" | "schedule";

const COPY: Record<GateKind, { eyebrow: string; heading: string; lead: (t: string) => React.ReactNode }> = {
  approve: {
    eyebrow: "Can't move it yet",
    heading: "The brief isn't complete",
    lead: (t) => <>“{t}” can&apos;t be <b>Approved</b> until these are filled in:</>,
  },
  output: {
    eyebrow: "Can't move it yet",
    heading: "No creative to hand off",
    lead: (t) => <>“{t}” can&apos;t be marked <b>Output-Ready</b> until there&apos;s a deliverable. Upload the creative, or add the output link (Drive / Canva) in <b>Creatives &amp; files</b>.</>,
  },
  publish: {
    eyebrow: "Can't move it yet",
    heading: "Not ready to publish",
    lead: (t) => <>“{t}” can&apos;t go to <b>Ready to Publish</b> until these are in place:</>,
  },
  create: {
    eyebrow: "Can't create it yet",
    heading: "The task is missing some details",
    lead: () => <>A task needs these before it can go into the hub:</>,
  },
  schedule: {
    eyebrow: "Can't schedule it yet",
    heading: "The post isn't complete",
    lead: () => <>Fill these in before it can go into the publishing queue:</>,
  },
};

const S = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(20,22,40,.42)", display: "flex",
    alignItems: "flex-start", justifyContent: "center", padding: "clamp(2rem,7vh,5rem) 1rem",
    zIndex: 90, overflowY: "auto",
  },
  card: {
    position: "relative", width: "100%", maxWidth: 440, background: "#fff",
    border: "1px solid #E9EBF0", borderRadius: 18, boxShadow: "0 30px 80px rgba(20,22,40,.3)",
    padding: "1.5rem 1.6rem", fontFamily: "inherit",
  },
  close: {
    position: "absolute", top: "1.1rem", right: "1.1rem", width: 30, height: 30, borderRadius: 8,
    border: "1px solid #E9EBF0", background: "#fff", color: "#8A92A6", cursor: "pointer",
    fontSize: ".85rem", lineHeight: 1,
  },
  eyebrow: {
    fontSize: ".64rem", textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 600,
    color: "#C0392B", marginBottom: ".4rem",
  },
  heading: { fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-.01em", color: "#232D42", paddingRight: "2rem", marginBottom: ".6rem" },
  lead: { fontSize: ".85rem", color: "#4A5468", marginBottom: ".8rem", lineHeight: 1.5 },
  list: { margin: "0 0 1rem", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: ".4rem" },
  item: { display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".86rem", color: "#232D42" },
  dot: { width: 6, height: 6, borderRadius: 99, background: "#C0392B", flexShrink: 0 },
  note: { fontSize: ".78rem", color: "#8A92A6", marginBottom: "1rem", lineHeight: 1.5 },
  foot: { display: "flex", justifyContent: "flex-end" },
  btn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: ".8rem",
    fontWeight: 600, borderRadius: 9, padding: ".5em .9em", border: "1px solid transparent",
    background: "#3A57E8", color: "#fff", cursor: "pointer",
  },
} satisfies Record<string, React.CSSProperties>;

export default function MissingFieldsModal({
  gate, missing, title = "This task", note, onClose,
}: {
  gate: GateKind;
  missing: string[];
  title?: string;
  note?: React.ReactNode;
  onClose: () => void;
}) {
  const copy = COPY[gate] || COPY.approve;
  // The output gate explains itself in the lead line; a one-item bullet under it
  // would just repeat the sentence.
  const showList = missing.length > 0 && !(gate === "output" && missing.length === 1);
  return (
    <div style={S.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={S.card} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={onClose} title="Close" aria-label="Close">✕</button>
        <div style={S.eyebrow}>{copy.eyebrow}</div>
        <div style={S.heading}>{copy.heading}</div>
        <div style={S.lead}>{copy.lead(title)}</div>
        {showList && (
          <ul style={S.list}>
            {missing.map((m, i) => (
              <li key={i} style={S.item}><span style={S.dot} />{m}</li>
            ))}
          </ul>
        )}
        {note && <div style={S.note}>{note}</div>}
        <div style={S.foot}>
          <button style={S.btn} onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

// Normalize a fetch Response + parsed body into a gate block, or null when the
// failure isn't a completeness gate (callers keep their own error handling for
// those). Keeps every call site down to three lines.
export type GateBlock = { gate: GateKind; missing: string[]; title: string };

export function gateFromResponse(status: number, body: unknown, title: string): GateBlock | null {
  if (status !== 422) return null;
  const j = (body || {}) as { missing?: unknown; gate?: unknown };
  if (!Array.isArray(j.missing) || j.missing.length === 0) return null;
  const g = typeof j.gate === "string" ? j.gate : "approve";
  const gate: GateKind = (["approve", "output", "publish", "create", "schedule"] as const).includes(g as GateKind)
    ? (g as GateKind) : "approve";
  return { gate, missing: j.missing.map(String), title };
}
