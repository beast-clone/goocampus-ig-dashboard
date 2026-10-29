// Attendance PDF report — the layout approved in docs/attendance-prototype/v11.html.
// Real text and vector graphs drawn with jsPDF (loaded on demand, ~350KB). Page 1 is the
// team: summary, hours-per-person bars, one table. Week / Month / Custom then give each
// person a page: their daily-hours graph and their day list.
import type { jsPDF as JsPDF } from "jspdf";
import { type Row, clock, dayLabel, fmt, hrs, short } from "./attendance-utils";

export type ReportInput = {
  title: string;                       // e.g. "October 2026"
  cards: [string, string, string][];   // label, value, sub — the board's summary cards
  multi: boolean;                      // false = Day view
  rows: Row[];
  days: string[];                      // the range, aligned with each row's x[]
  work: string[];                      // recorded working days in the range
  today: string;
  isToday: boolean;                    // Day view of today
};

export async function buildAttendancePdf(r: ReportInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  const INK: [number, number, number] = [35, 45, 66], MUT: [number, number, number] = [138, 146, 166], BODY: [number, number, number] = [59, 68, 87];
  const LINE: [number, number, number] = [238, 240, 244];
  const font = (sz: number, bold: boolean, c = INK) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(sz); doc.setTextColor(...c); };
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const avg = (row: Row) => fmt(Math.round(row.tot / Math.max(1, row.present)));
  const target = r.work.length * 480;
  let y = 0, heading = "Attendance report";

  const top = (h: string, sub: string) => {
    doc.setFillColor(58, 87, 232); doc.rect(0, 0, W, 6, "F");
    y = M + 8; font(16, true); doc.text(h, M, y); font(9.5, false, MUT); doc.text(sub, M, y + 15); y += 34;
  };
  // Rows squeeze (17pt → 12pt) so a full month of days still fits on the person's one page.
  const table = (cols: string[], widths: number[], data: (string | number)[][]) => {
    const heads = () => {
      font(8, true, MUT); let x = M; cols.forEach((c, i) => { doc.text(c.toUpperCase(), x, y); x += widths[i]; });
      y += 6; doc.setDrawColor(222, 226, 235); doc.line(M, y, W - M, y); y += 13;
    };
    heads();
    const rh = Math.max(12, Math.min(17, (H - M - 14 - y) / Math.max(1, data.length)));
    for (const row of data) {
      if (y > H - M - 10) { doc.addPage(); top(`${heading} (continued)`, r.title); heads(); }
      let x = M;
      row.forEach((v, i) => { font(9, false, v === "Absent" ? [241, 106, 27] : BODY); doc.text(String(v), x, y); x += widths[i]; });
      doc.setDrawColor(...LINE); doc.line(M, y + rh * 0.3, W - M, y + rh * 0.3); y += rh;
    }
  };

  // ── page 1 — the team
  const stamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  top("Attendance report", `${r.title}  ·  generated ${stamp}`);
  const cw = (W - M * 2 - 30) / 4;
  r.cards.forEach(([l, v, s], i) => {
    const x = M + i * (cw + 10);
    doc.setDrawColor(...LINE); doc.roundedRect(x, y, cw, 50, 6, 6, "S");
    font(8.5, false, MUT); doc.text(l, x + 12, y + 16); font(15, true); doc.text(String(v), x + 12, y + 34); font(7.5, false, MUT); doc.text(s, x + 12, y + 44);
  });
  y += 72;

  // Hours per person — thin brand-blue bars on a light track; a full track = the target.
  const goal = r.multi ? target : 480;
  font(11, true); doc.text(r.multi ? "Hours worked per person" : "Hours worked", M, y);
  font(8.5, false, MUT); doc.text(`full bar = ${goal / 60}h target${r.multi ? ` (8h × ${r.work.length} working days)` : ""}`, W - M, y, { align: "right" });
  y += 18;
  const bx = M + 90, bw = W - M * 2 - 200, bh = 6, gap = 20;
  r.rows.forEach((row, i) => {
    const yy = y + i * gap, f = goal ? Math.min(1, row.tot / goal) : 0;
    font(9, false, INK); doc.text(row.p.name, M, yy + 5);
    doc.setFillColor(...LINE); doc.roundedRect(bx, yy, bw, bh, 3, 3, "F");
    if (row.tot) { doc.setFillColor(58, 87, 232); doc.roundedRect(bx, yy, Math.max(bh, bw * f), bh, 3, 3, "F"); }
    font(9, true); doc.text(fmt(row.tot), bx + bw + 16, yy + 5);
    font(9, false, MUT); doc.text(`${goal ? Math.round((row.tot / goal) * 100) : 0}%`, W - M, yy + 5, { align: "right" });
  });
  y += r.rows.length * gap + 14;

  if (r.multi) {
    table(["Person", "Days present", "Days absent", "Average day", "Hours worked", "% of target"], [150, 110, 110, 110, 120, 100],
      r.rows.map((row) => [row.p.name, `${row.present} of ${r.work.length}`, r.work.filter((d) => d < r.today && !row.x[r.days.indexOf(d)]).length, avg(row), fmt(row.tot), target ? `${Math.round((row.tot / target) * 100)}%` : "—"]));
  } else {
    table(["Person", "Arrived", "Left", "Hours worked", "Status"], [150, 120, 120, 120, 200],
      r.rows.map((row) => {
        const x = row.x[0];
        return [row.p.name, x ? clock(x.in) : "—", x ? (x.live ? `last seen ${clock(x.out)}` : clock(x.out)) : "—", fmt(row.tot), !x ? (r.isToday ? "Not in yet" : "Absent") : x.live ? "Working" : "Left"];
      }));
  }

  // ── one page per person — their graph, then their day list
  if (r.multi) for (const row of r.rows) {
    doc.addPage(); heading = row.p.name; top(row.p.name, `${row.p.role}  ·  ${r.title}`);
    font(20, true); doc.text(fmt(row.tot), M, y + 4);
    const tw = doc.getTextWidth(fmt(row.tot));
    font(9, false, MUT); doc.text(`worked  ·  ${row.present} of ${r.work.length} days present  ·  average day ${avg(row)}`, M + tw + 10, y + 2);
    y += 22;
    // Like the board's graph, today joins the line once it's over.
    const pts = r.work.filter((d) => d < r.today).map((d) => ({ d, m: hrs(row.x[r.days.indexOf(d)]) }));
    if (pts.length >= 2) {
      const gx = M + 24, gw = W - M * 2 - 30, gh = 100, mx = Math.max(600, ...pts.map((p) => p.m));
      const X = (j: number) => gx + (j * gw) / (pts.length - 1), Y = (m: number) => y + gh - (m / mx) * gh;
      font(7.5, false, MUT);
      for (let g = 0; g <= mx / 60; g += 2) { doc.setDrawColor(...LINE); doc.line(gx, Y(g * 60), gx + gw, Y(g * 60)); doc.text(`${g}h`, gx - 6, Y(g * 60) + 3, { align: "right" }); }
      doc.setDrawColor(...INK); doc.setLineDashPattern([3, 3], 0); doc.line(gx, Y(480), gx + gw, Y(480)); doc.setLineDashPattern([], 0); doc.text("8h", gx + gw, Y(480) - 4, { align: "right" });
      doc.setDrawColor(...rgb(row.color)); doc.setLineWidth(1.6);
      for (let j = 1; j < pts.length; j++) doc.line(X(j - 1), Y(pts[j - 1].m), X(j), Y(pts[j].m));
      doc.setFillColor(255, 255, 255); pts.forEach((p, j) => doc.circle(X(j), Y(p.m), 2.2, "FD")); doc.setLineWidth(0.5);
      const step = Math.ceil(pts.length / 10); font(7.5, false, MUT);
      pts.forEach((p, j) => { if (j % step === 0 || j === pts.length - 1) doc.text(short(p.d), X(j), y + gh + 12, { align: "center" }); });
      y += gh + 32;
    }
    table(["Date", "Arrived", "Left", "Hours worked"], [160, 140, 140, 140],
      r.work.map((d) => {
        const x = row.x[r.days.indexOf(d)];
        return x ? [dayLabel(d), clock(x.in), x.live ? `last seen ${clock(x.out)}` : clock(x.out), fmt(hrs(x))] : [dayLabel(d), d === r.today ? "Not in yet" : "Absent", "", ""];
      }));
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); font(7.5, false, [166, 172, 190]);
    doc.text("Hours = arrival to End day (or last activity), minus the 1-hour lunch  ·  GooCampus Marketing OS", M, H - 18);
    doc.text(`${i} of ${n}`, W - M, H - 18, { align: "right" });
  }
  return doc;
}

/**
 * Draw the PDF's pages into `box` as canvases — the preview. Not an <iframe>: the
 * dashboard's CSP blocks blob: frames. pdf.js is set up the same way as PdfThumb.
 */
export async function renderPdfPages(doc: JsPDF, box: HTMLElement): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: doc.output("arraybuffer") }).promise;
  box.innerHTML = "";
  const width = Math.min(1000, box.clientWidth - 40);
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: (width * 2) / base.width });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    c.style.cssText = `width:${width}px;background:#fff;border:1px solid #EEF0F4;border-radius:8px;flex-shrink:0`;
    box.appendChild(c);
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
  }
}
