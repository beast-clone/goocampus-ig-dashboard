"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// The first page of a PDF, drawn as its thumbnail — a PDF creative showed as a blank
// white tile (Praveen, 21 Oct). pdf.js is loaded only when a PDF is on screen; the
// worker is served from /public (see the LinkedIn posts page, which does the same).
// Files live in the public Supabase bucket, which allows cross-origin reads.
type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

export const isPdf = (urlOrName: string, mime?: string | null) =>
  (mime || "").toLowerCase() === "application/pdf" || /\.pdf($|[?#])/i.test(urlOrName || "");

/** How many pages a PDF has (0 if it can't be read). */
export async function pdfPageCount(url: string): Promise<number> {
  try { const pdfjs = await loadPdfjs(); return (await pdfjs.getDocument({ url, disableAutoFetch: true }).promise).numPages; }
  catch { return 0; }
}

export function PdfThumb({ url, width = 220, fallback, page: pageNo = 1, fit = "top", badge = true }: {
  url: string; width?: number; fallback: ReactNode;
  /** Which page to draw (1-based). */ page?: number;
  /** "top": fill the width, crop the bottom (tiles). "contain": the whole page, centred (viewer). */ fit?: "top" | "contain";
  badge?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true }).promise;
        const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
        const canvas = canvasRef.current;
        if (!canvas || dead) return;
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width * 2) / base.width });   // 2x for sharp tiles
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (!dead) setState("ok");
      } catch {
        if (!dead) setState("err");
      }
    })();
    return () => { dead = true; };
  }, [url, width, pageNo]);
  if (state === "err") return <>{fallback}</>;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: fit === "contain" ? "transparent" : "#F6F7FB", display: fit === "contain" ? "flex" : "block", alignItems: "center", justifyContent: "center" }}>
      <canvas ref={canvasRef} style={fit === "contain"
        ? { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", display: "block", opacity: state === "ok" ? 1 : 0 }
        : { width: "100%", height: "auto", display: "block", opacity: state === "ok" ? 1 : 0 }} />
      {badge && <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 9, fontWeight: 500, letterSpacing: ".04em", color: "#fff", background: "rgba(35,45,66,.72)", borderRadius: 4, padding: "1px 4px" }}>PDF</span>}
    </div>
  );
}
