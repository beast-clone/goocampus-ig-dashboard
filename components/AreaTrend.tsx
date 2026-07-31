"use client";
import { useMemo, useState } from "react";

// Shared trend graph — the ONE house style used across the dashboard (matches the
// Overview reach/engagement chart): gradient area fill, faint gridlines, a thick
// rounded line, and a hover crosshair + dot + tooltip. Generic {label,value} data
// so any tab can render an identical-looking graph.
const INK = "#232D42", MUTED = "#8A92A6", LINE = "#EEF0F4";

export function AreaTrend({
  data, color = "#3A57E8", format = (n: number) => n.toLocaleString("en-IN"), unit,
}: {
  data: { label: string; value: number }[];
  color?: string;
  format?: (n: number) => string;
  unit?: string;
}) {
  const W = 1120, H = 220, PB = 26, PT = 12, PL = 8, PR = 8;
  const pts = (data || []).filter((d) => typeof d.value === "number");
  const [hover, setHover] = useState<number | null>(null);
  const gid = useMemo(() => `atFill-${Math.abs(hashStr(color + pts.length + (unit || "")))}`, [color, pts.length, unit]);
  const { area, line, max } = useMemo(() => {
    if (pts.length < 2) return { area: "", line: "", max: 1 };
    const max = Math.max(1, ...pts.map((p) => p.value || 0));
    const x = (i: number) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value || 0).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`;
    return { area, line, max };
  }, [pts]);

  if (pts.length < 2) return <div className="text-[13px] text-gray-400 py-10 text-center">Not enough data yet.</div>;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(frac * (pts.length - 1)))));
  };
  const hx = hover != null ? (hover / (pts.length - 1)) * 100 : 0;
  const hy = hover != null ? ((PT + (1 - (pts[hover].value || 0) / max) * (H - PT - PB)) / H) * 100 : 0;

  return (
    <div style={{ position: "relative", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={PL} x2={W - PR} y1={PT + g * (H - PT - PB)} y2={PT + g * (H - PT - PB)} stroke={LINE} strokeWidth="1" />)}
        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      {/* x-axis labels — first, middle, last (keeps it clean at this width) */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: MUTED }}>
        <span>{pts[0].label}</span>
        <span>{pts[Math.floor((pts.length - 1) / 2)].label}</span>
        <span>{pts[pts.length - 1].label}</span>
      </div>
      {hover != null && pts[hover] && (
        <>
          <div style={{ position: "absolute", left: `${hx}%`, top: 0, bottom: 26, width: 1, background: "rgba(35,45,66,0.18)", transform: "translateX(-0.5px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: `${hx}%`, top: `${hy}%`, width: 11, height: 11, borderRadius: 99, background: color, border: "2.5px solid #fff", transform: "translate(-50%, -50%)", boxShadow: "0 2px 6px rgba(35,45,66,0.25)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: `${hx}%`, top: 6, transform: hx > 62 ? "translateX(calc(-100% - 10px))" : "translateX(10px)", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(20,30,60,.10)", padding: "8px 11px", fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>
            <div style={{ fontWeight: 600, color: INK, marginBottom: 3 }}>{pts[hover].label}</div>
            <div style={{ color: MUTED, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: color }} /> {unit || "Value"} <b style={{ color: INK, marginLeft: 2 }}>{format(pts[hover].value || 0)}</b></div>
          </div>
        </>
      )}
    </div>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}
