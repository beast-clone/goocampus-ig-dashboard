"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconPencil, IconHighlight, IconEraser, IconArrowBackUp, IconArrowForwardUp, IconTrash, IconCheck, IconChevronDown,
  IconPhoto, IconCalendar, IconLayoutGrid, IconLoader2, IconAlertTriangle, IconLine, type Icon,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { confirmDialog } from "../ConfirmDialog";

// Plan board (Content → Plan board, 30 Oct; prototype docs/plan-board-prototype/v1.html).
// Write by hand — mouse, pen or finger — like Manya's sheet of paper. Only the Blank board
// is on for now; the two calendar boards stay in the picker, greyed out, until they're built.
// Each person has their own board, saved to the dashboard (/api/plan-board).

type Pt = [number, number, number];                       // x, y in 0..1 of the board; pen pressure
type Stroke = { c: string; w: number; hl?: boolean; p: Pt[] };
type Mode = "pen" | "hl" | "erase";
type Hist = { undo: () => void; redo: () => void };

const COLORS = [["#232D42", "Black"], ["#3A57E8", "Blue"], ["#C0201F", "Red"], ["#1AA053", "Green"], ["#E08A00", "Orange"]] as const;
const SIZES = [[1.6, 4], [2.6, 7], [4.2, 10]] as const;   // stroke width, dot size in the button
const BOARDS: { k: string; name: string; sub: string; I: Icon; on: boolean }[] = [
  { k: "blank", name: "Blank board", sub: "An empty page — plan, brainstorm, mind-map", I: IconPhoto, on: true },
  { k: "calendar", name: "Calendar", sub: "Two weeks to write on, like paper", I: IconCalendar, on: false },
  { k: "boxes", name: "Calendar with boxes", sub: "A box per post, with a topic tally", I: IconLayoutGrid, on: false },
];

export default function PlanBoardPage() {
  return (
    <PreviewDashboardShell active="plan-board" title="Plan board" hideAccountPicker hideRange
      subtitle="Plan by hand — write with your mouse, pen or finger, like on paper.">
      {() => <PlanBoard />}
    </PreviewDashboardShell>
  );
}

function PlanBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const erasing = useRef(false);
  const undoStack = useRef<Hist[]>([]), redoStack = useRef<Hist[]>([]);
  const [mode, setMode] = useState<Mode>("pen");
  const [color, setColor] = useState<string>(COLORS[0][0]);
  const [size, setSize] = useState<number>(SIZES[1][0]);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [menu, setMenu] = useState(false);
  const [straighten, setStraighten] = useState(true);   // snap nearly-straight lines straight
  const straightenRef = useRef(true);
  straightenRef.current = straighten;
  const tool = useRef({ mode, color, size });
  tool.current = { mode, color, size };

  // ── drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!, w = cv.clientWidth, h = cv.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
      const p = s.p; if (!p.length) continue;
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
      if (s.hl) { ctx.globalAlpha = 0.28; ctx.globalCompositeOperation = "multiply"; }
      const base = s.hl ? s.w * 5 : s.w;
      if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0] * w, p[0][1] * h, base / 2, 0, 7); ctx.fill(); ctx.restore(); continue; }
      // Curves run midpoint to midpoint with each point as the control, so neighbouring
      // pieces meet exactly — drawing point-to-point left little barbs where they joined.
      const X = (q: Pt) => q[0] * w, Y = (q: Pt) => q[1] * h;
      const mid = (a: Pt, b: Pt): [number, number] => [(X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2];
      const width = (q: Pt) => (s.hl ? base : base * (0.55 + q[2] * 0.9));
      if (s.hl || p.every((q) => q[2] === p[0][2])) {
        // Even width (mouse, finger, highlighter): one continuous path.
        ctx.lineWidth = width(p[0]);
        ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[0]));
        for (let i = 1; i < p.length - 1; i++) { const [mx, my] = mid(p[i], p[i + 1]); ctx.quadraticCurveTo(X(p[i]), Y(p[i]), mx, my); }
        ctx.lineTo(X(p[p.length - 1]), Y(p[p.length - 1]));
        ctx.stroke();
      } else {
        // Pen pressure: the same curve in pieces, each its own width.
        let [sx, sy] = [X(p[0]), Y(p[0])];
        for (let i = 1; i < p.length; i++) {
          const last = i === p.length - 1;
          const [ex, ey] = last ? [X(p[i]), Y(p[i])] : mid(p[i], p[i + 1]);
          ctx.lineWidth = width(p[i]);
          ctx.beginPath(); ctx.moveTo(sx, sy);
          if (last) ctx.lineTo(ex, ey); else ctx.quadraticCurveTo(X(p[i]), Y(p[i]), ex, ey);
          ctx.stroke();
          [sx, sy] = [ex, ey];
        }
      }
      ctx.restore();
    }
  }, []);
  const fit = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(cv.clientWidth * dpr)); cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
    cv.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }, [draw]);

  // ── saving (a second after the last change) ──────────────────────────────
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changed = useCallback(() => {
    setHist({ u: undoStack.current.length, r: redoStack.current.length });
    setSave("saving");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/plan-board", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strokes: strokes.current }) });
        setSave(r.ok ? "saved" : "error");
      } catch { setSave("error"); }
    }, 900);
  }, []);
  const push = (h: Hist) => { undoStack.current.push(h); redoStack.current = []; changed(); };

  useEffect(() => {
    fetch("/api/plan-board", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      strokes.current = Array.isArray(j?.board?.strokes) ? j.board.strokes : [];
      setLoaded(true); requestAnimationFrame(fit);
    }).catch(() => { setLoaded(true); setSave("error"); });
  }, [fit]);
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ro = new ResizeObserver(fit); ro.observe(cv);
    return () => ro.disconnect();
  }, [fit]);

  // ── pointer input ────────────────────────────────────────────────────────
  const pt = (e: PointerEvent | React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.pointerType === "pen" ? (e.pressure || 0.5) : 0.5];
  };
  const eraseAt = (q: Pt) => {
    const cv = canvasRef.current!, w = cv.clientWidth, h = cv.clientHeight;
    for (let i = strokes.current.length - 1; i >= 0; i--) {
      const s = strokes.current[i];
      if (s.p.some((a) => Math.hypot((a[0] - q[0]) * w, (a[1] - q[1]) * h) < 9 + s.w)) {
        strokes.current.splice(i, 1);
        push({ undo: () => strokes.current.splice(Math.min(i, strokes.current.length), 0, s), redo: () => { const j = strokes.current.indexOf(s); if (j >= 0) strokes.current.splice(j, 1); } });
        draw();
      }
    }
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
    const t = tool.current;
    if (t.mode === "erase") { erasing.current = true; eraseAt(pt(e)); return; }
    cur.current = { c: t.color, w: t.size, hl: t.mode === "hl", p: [pt(e)] }; draw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const co = e.nativeEvent.getCoalescedEvents?.() || [];
    const evs = co.length ? co : [e.nativeEvent];   // some browsers report none — use the event itself
    if (erasing.current) { evs.forEach((x) => eraseAt(pt(x))); return; }
    if (!cur.current) return;
    // Light smoothing: drop points under ~1.5px apart and ease each new point toward the
    // last one, so hand / mouse jitter doesn't show as wobbles.
    const cv = canvasRef.current!, w = cv.clientWidth, h = cv.clientHeight, p = cur.current.p;
    evs.forEach((x) => {
      const q = pt(x), l = p[p.length - 1];
      if (Math.hypot((q[0] - l[0]) * w, (q[1] - l[1]) * h) < 1.5) return;
      p.push([l[0] + (q[0] - l[0]) * 0.6, l[1] + (q[1] - l[1]) * 0.6, q[2]]);
    });
    draw();
  };
  // A stroke drawn as a line — every point within 4% of its length (min 3px) of the line from
  // its start to its end, and at least 30px long — becomes that exact line. Within 4° of flat
  // or upright it is levelled. Anything curvier (writing, circles) is left as drawn.
  const straightened = (s: Stroke): Stroke => {
    const cv = canvasRef.current; if (!cv || s.hl || s.p.length < 3) return s;
    const w = cv.clientWidth, h = cv.clientHeight, a = s.p[0], b = s.p[s.p.length - 1];
    const ax = a[0] * w, ay = a[1] * h, bx = b[0] * w, by = b[1] * h, len = Math.hypot(bx - ax, by - ay);
    if (len < 30) return s;
    const far = Math.max(...s.p.map((q) => Math.abs((bx - ax) * (ay - q[1] * h) - (ax - q[0] * w) * (by - ay)) / len));
    if (far > Math.max(3, len * 0.04)) return s;
    let end: Pt = [b[0], b[1], b[2]];
    const deg = Math.abs((Math.atan2(by - ay, bx - ax) * 180) / Math.PI);
    if (deg < 4 || deg > 176) end = [b[0], a[1], b[2]];            // level
    else if (Math.abs(deg - 90) < 4) end = [a[0], b[1], b[2]];     // upright
    const pr = s.p.reduce((t, q) => t + q[2], 0) / s.p.length;
    return { ...s, p: [[a[0], a[1], pr], [end[0], end[1], pr]] };
  };
  const onUp = () => {
    if (erasing.current) { erasing.current = false; return; }
    const drawn = cur.current; if (!drawn) return;
    const s = straightenRef.current ? straightened(drawn) : drawn;
    cur.current = null; strokes.current.push(s);
    push({ undo: () => { const j = strokes.current.indexOf(s); if (j >= 0) strokes.current.splice(j, 1); }, redo: () => strokes.current.push(s) });
    draw();
  };

  const undo = useCallback(() => { const a = undoStack.current.pop(); if (!a) return; a.undo(); redoStack.current.push(a); draw(); changed(); }, [draw, changed]);
  const redo = useCallback(() => { const a = redoStack.current.pop(); if (!a) return; a.redo(); undoStack.current.push(a); draw(); changed(); }, [draw, changed]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [undo, redo]);
  const clearAll = async () => {
    if (!strokes.current.length) return;
    if (!(await confirmDialog({ title: "Clear the whole board?", body: "Everything written on it is removed. You can undo straight after.", action: "Clear", danger: true }))) return;
    const was = strokes.current.splice(0);
    push({ undo: () => strokes.current.push(...was), redo: () => { strokes.current.length = 0; } });
    draw();
  };

  const toolBtn = (m: Mode, I: Icon, label: string) => (
    <button type="button" title={label} aria-label={label} onClick={() => setMode(m)}
      className={`w-9 h-9 rounded-[9px] border grid place-items-center ${mode === m ? "border-brand bg-brand-light text-brand" : "border-gray-100 bg-white text-[#232D42] hover:border-brand"}`}><I size={18} stroke={1.8} /></button>
  );
  const sep = <span className="w-px h-7 bg-gray-100" />;
  const board = BOARDS[0];

  return (
    <div className="preview-scope space-y-3">
      <div className="bg-white border border-gray-100 rounded-2xl px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
        {/* Board picker — only the Blank board for now */}
        <div className="relative">
          <button type="button" onClick={() => setMenu((o) => !o)}
            className="h-11 min-w-[210px] flex items-center gap-2.5 pl-2 pr-3 rounded-[11px] border border-gray-100 bg-white hover:border-brand text-left">
            <span className="w-[30px] h-[30px] rounded-lg bg-brand-light text-brand grid place-items-center"><board.I size={17} stroke={1.8} /></span>
            <span><span className="block text-[10.5px] uppercase tracking-wide text-[#8A92A6] leading-tight">Board</span><span className="block text-[14px] font-medium text-[#232D42] leading-tight">{board.name}</span></span>
            <IconChevronDown size={16} stroke={1.8} className="ml-auto text-[#8A92A6]" />
          </button>
          {menu && (<>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
            <div className="absolute z-30 top-[calc(100%+6px)] left-0 w-[320px] bg-white border border-gray-100 rounded-xl p-1.5">
              {BOARDS.map((b) => (
                <button key={b.k} type="button" disabled={!b.on} onClick={() => setMenu(false)}
                  className={`w-full flex items-start gap-2.5 text-left rounded-[9px] px-2.5 py-2 ${b.on ? "hover:bg-[#F6F7FB]" : "opacity-50 cursor-not-allowed"} ${b.k === board.k ? "bg-[#F6F7FB]" : ""}`}>
                  <span className="w-[30px] h-[30px] rounded-lg bg-brand-light text-brand grid place-items-center flex-none"><b.I size={17} stroke={1.8} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-medium text-[#232D42]">{b.name}{!b.on && <span className="text-[10.5px] font-medium rounded-full px-1.5 py-0.5 bg-[#F0F2F8] text-[#8A92A6]">Coming soon</span>}</span>
                    <span className="block text-[12px] text-[#8A92A6]">{b.sub}</span>
                  </span>
                  {b.k === board.k && <IconCheck size={16} stroke={2} className="text-brand mt-1" />}
                </button>
              ))}
            </div>
          </>)}
        </div>
        {sep}
        {toolBtn("pen", IconPencil, "Pen")}
        {toolBtn("hl", IconHighlight, "Highlighter")}
        {toolBtn("erase", IconEraser, "Eraser — touch a line to remove it")}
        <button type="button" onClick={() => setStraighten((v) => !v)} aria-pressed={straighten}
          title={straighten ? "Straight lines: on — a nearly straight line snaps straight when you lift. Click to turn off." : "Straight lines: off — lines stay exactly as drawn. Click to turn on."}
          className={`h-9 px-2.5 rounded-[9px] border inline-flex items-center gap-1.5 text-[13px] font-medium ${straighten ? "border-brand bg-brand-light text-brand" : "border-gray-100 bg-white text-[#8A92A6] hover:border-brand"}`}>
          <IconLine size={17} stroke={1.8} />Straight lines</button>
        {sep}
        {COLORS.map(([c, n]) => (
          <button key={c} type="button" title={n} aria-label={n} onClick={() => { setColor(c); if (mode === "erase") setMode("pen"); }}
            className="w-[22px] h-[22px] rounded-full border-2 border-white" style={{ background: c, boxShadow: `0 0 0 ${color === c ? 2 : 1}px ${color === c ? "#3A57E8" : "#EEF0F5"}` }} />
        ))}
        {sep}
        {SIZES.map(([s, d]) => (
          <button key={s} type="button" title={s === SIZES[0][0] ? "Thin" : s === SIZES[1][0] ? "Medium" : "Thick"} onClick={() => setSize(s)}
            className={`w-8 h-8 rounded-lg border grid place-items-center ${size === s ? "border-brand bg-brand-light" : "border-gray-100 bg-white"}`}><span className="rounded-full bg-[#232D42]" style={{ width: d, height: d }} /></button>
        ))}
        {sep}
        <button type="button" title="Undo (Ctrl+Z)" disabled={!hist.u} onClick={undo} className="w-9 h-9 rounded-[9px] border border-gray-100 bg-white grid place-items-center text-[#232D42] disabled:opacity-35"><IconArrowBackUp size={18} stroke={1.8} /></button>
        <button type="button" title="Redo (Ctrl+Y)" disabled={!hist.r} onClick={redo} className="w-9 h-9 rounded-[9px] border border-gray-100 bg-white grid place-items-center text-[#232D42] disabled:opacity-35"><IconArrowForwardUp size={18} stroke={1.8} /></button>
        <button type="button" onClick={() => void clearAll()} className="h-9 px-3 rounded-[9px] border border-gray-100 bg-white inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#232D42] hover:border-brand"><IconTrash size={16} stroke={1.8} />Clear board</button>
        <span className="ml-auto text-[12px] text-[#8A92A6] inline-flex items-center gap-1.5">
          {save === "saving" ? <><IconLoader2 size={14} stroke={2} className="animate-spin" />Saving…</>
            : save === "error" ? <span className="text-[#C0201F] inline-flex items-center gap-1"><IconAlertTriangle size={14} stroke={1.8} />Not saved — check your connection</span>
            : <><IconCheck size={14} stroke={2} />Saved</>}
        </span>
      </div>

      <section className="bg-white border border-gray-100 rounded-2xl">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
          <IconPhoto size={18} stroke={1.8} className="text-brand" />
          <span className="text-[15px] font-medium text-[#232D42]">Blank board</span>
          <span className="ml-auto text-[12.5px] text-[#8A92A6]">Only you see your board</span>
        </div>
        <div className="relative mx-3 mb-3 rounded-xl border border-gray-100 overflow-hidden h-[calc(100vh-260px)] min-h-[520px]"
          style={{ background: "#fff radial-gradient(#D9DDE8 1px, transparent 1.2px) 0 0 / 22px 22px" }}>
          <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            className="absolute inset-0 w-full h-full" style={{ touchAction: "none", cursor: mode === "erase" ? "cell" : "crosshair" }} />
          {!loaded && <div className="absolute inset-0 grid place-items-center text-[13px] text-[#8A92A6]">Loading your board…</div>}
        </div>
      </section>
    </div>
  );
}
