// Downloading a report — Markdown and PDF, from one description of the data.
//
// The dashboard already has a PDF button (components/PdfExportButton) but it works by
// screenshotting the page with html2canvas: fine for a tab full of charts, wrong for a
// report. It produces an image, so nothing in it can be selected, searched or pasted;
// it is large; and it captures what is on screen, which for a 500-row table is the
// first twenty rows and a scrollbar.
//
// These two write the actual data instead, so both formats carry every row and agree
// with each other because they are built from the same object.

export type ReportSection = {
  /** Optional group heading — the radar report groups by day, the usage report doesn't. */
  heading?: string;
  /** A line under the heading, e.g. "6 shown · 2 written · 3 no action". */
  note?: string;
  rows: (string | number | null | undefined)[][];
};

export type ExportReport = {
  title: string;
  subtitle?: string;
  /** Headline figures, one per line under the title. */
  meta?: string[];
  columns: string[];
  sections: ReportSection[];
  /** Long free text that does not fit a table cell, printed after the table. */
  appendix?: { heading: string; body: string }[];
};

const cell = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : String(v).replace(/\r?\n/g, " ").trim();

const stamp = () =>
  new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

export function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ Markdown */

export function toMarkdown(r: ExportReport): string {
  const out: string[] = [];
  out.push(`# ${r.title}`, "");
  if (r.subtitle) out.push(`_${r.subtitle}_`, "");
  for (const m of r.meta || []) out.push(`- ${m}`);
  if (r.meta?.length) out.push("");

  for (const s of r.sections) {
    if (s.heading) {
      out.push(`## ${s.heading}`);
      if (s.note) out.push("", `_${s.note}_`);
      out.push("");
    }
    // A pipe inside a cell would split it into two columns, so it is escaped rather
    // than stripped — the text still reads correctly.
    const esc = (v: unknown) => cell(v).replace(/\|/g, "\\|");
    out.push(`| ${r.columns.join(" | ")} |`);
    out.push(`| ${r.columns.map(() => "---").join(" | ")} |`);
    for (const row of s.rows) out.push(`| ${row.map(esc).join(" | ")} |`);
    out.push("");
  }

  for (const a of r.appendix || []) {
    out.push(`## ${a.heading}`, "", a.body, "");
  }

  out.push("---", `Generated ${stamp()} · GooCampus Marketing OS`);
  return out.join("\n");
}

/* ------------------------------------------------------------------ download */

function save(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadMarkdown(r: ExportReport, filename: string) {
  save(`${filename}.md`, toMarkdown(r), "text/markdown;charset=utf-8");
}

/* ------------------------------------------------------------------ PDF */

/**
 * Real text, laid out as a table, paginated. Landscape because these reports are wider
 * than they are tall, and portrait would squeeze eight columns into unreadable slivers.
 *
 * jsPDF is loaded on demand — it is ~350KB and nobody should carry it just for opening
 * a report they are only going to read.
 */
export async function downloadPdf(r: ExportReport, filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;                       // margin
  const BODY = 8.5;                   // body size — 8 columns need a small face
  const LINE = 11;                    // line height inside a wrapped cell
  let y = M;

  const page = () => { doc.addPage(); y = M; header(true); };
  const room = (need: number) => { if (y + need > H - M) page(); };

  // Column widths, proportional to the header lengths but floored so a short header
  // like "By" still gets usable room.
  const weights = r.columns.map((c) => Math.max(c.length, 6));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => ((W - M * 2) * w) / total);

  function header(continued = false) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(35, 45, 66);
    doc.text(continued ? `${r.title} (continued)` : r.title, M, y); y += 16;
    if (!continued) {
      if (r.subtitle) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(138, 146, 166);
        doc.text(r.subtitle, M, y); y += 12;
      }
      for (const m of r.meta || []) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(59, 68, 87);
        doc.text(m, M, y); y += 11;
      }
      y += 4;
    } else { y += 4; }
  }

  function columnHeads() {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(138, 146, 166);
    let x = M;
    r.columns.forEach((c, i) => { doc.text(c.toUpperCase(), x, y); x += widths[i]; });
    y += 5;
    doc.setDrawColor(222, 226, 235); doc.line(M, y, W - M, y); y += 9;
  }

  header();

  for (const s of r.sections) {
    if (s.heading) {
      room(30);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(35, 45, 66);
      doc.text(s.heading, M, y); y += 12;
      if (s.note) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(138, 146, 166);
        doc.text(s.note, M, y); y += 11;
      }
    }
    columnHeads();

    for (const row of s.rows) {
      // Wrap every cell first so the row's height is known before anything is drawn —
      // otherwise a long cell overflows into the row beneath it.
      const wrapped = row.map((v, i) => doc.splitTextToSize(cell(v), widths[i] - 8) as string[]);
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const height = lines * LINE + 4;
      if (y + height > H - M) { page(); columnHeads(); }

      doc.setFont("helvetica", "normal"); doc.setFontSize(BODY); doc.setTextColor(59, 68, 87);
      let x = M;
      wrapped.forEach((w, i) => { doc.text(w, x, y); x += widths[i]; });
      y += height;
      doc.setDrawColor(238, 240, 244); doc.line(M, y - 6, W - M, y - 6);
    }
    y += 8;
  }

  for (const a of r.appendix || []) {
    room(40);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(35, 45, 66);
    doc.text(a.heading, M, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(59, 68, 87);
    for (const line of doc.splitTextToSize(a.body, W - M * 2) as string[]) {
      room(LINE); doc.text(line, M, y); y += LINE;
    }
    y += 6;
  }

  // Footer on every page, added at the end so the page count is known.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(166, 172, 190);
    doc.text(`Generated ${stamp()} · GooCampus Marketing OS`, M, H - 18);
    doc.text(`${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}
