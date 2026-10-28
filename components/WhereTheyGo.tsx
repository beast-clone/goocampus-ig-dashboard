"use client";

// Where a task's creatives will be posted — the same split the Scheduler makes
// (Praveen, 28 Oct): a PDF is LinkedIn's carousel; pictures go to Instagram and
// Facebook; one video goes to both; a carousel with any video slide is Instagram
// only, because Facebook posts it as a still. Shown under Creatives & files in My Day
// and in the task window.
export function WhereTheyGo({ files }: { files: { kind: "image" | "video" | "pdf" | "file" }[] }) {
  const pdfs = files.filter((f) => f.kind === "pdf").length;
  const meta = files.filter((f) => f.kind === "image" || f.kind === "video");
  const videos = meta.filter((f) => f.kind === "video").length;
  if (!pdfs && !meta.length) return null;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const rows: { where: string; what: string; warn?: boolean }[] = [];
  if (meta.length > 1 && videos) rows.push({ where: "Instagram only", what: `${n(meta.length, "slide", "slides")} with video — Facebook doesn't take carousels with video slides`, warn: true });
  else if (meta.length) rows.push({ where: "Instagram + Facebook", what: videos ? "1 video" : n(meta.length, "picture", "pictures") });
  if (pdfs) rows.push({ where: "LinkedIn", what: n(pdfs, "PDF carousel", "PDF carousels") });
  return (
    <div className="mt-2 rounded-xl border border-[#EEF0F4] bg-white px-3 py-2 text-[12px] space-y-1">
      <div className="text-[11px] text-[#8A92A6]">Where these will be posted</div>
      {rows.map((r) => (
        <div key={r.where} className="flex gap-2">
          <span className={`w-[140px] shrink-0 font-medium ${r.warn ? "text-[#F16A1B]" : "text-[#232D42]"}`}>{r.where}</span>
          <span className="text-[#4A5468]">{r.what}</span>
        </div>
      ))}
    </div>
  );
}
