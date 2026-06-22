"use client";
import { useState } from "react";

export function AIReportButton({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string>("");

  async function run() {
    setLoading(true); setReport(""); setOpen(true);
    const res = await fetch("/api/ai-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, range }),
    });
    const data = await res.json();
    setReport(data.report || data.error || "No response.");
    setLoading(false);
  }

  return (
    <>
      <button onClick={run} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">
        ✨ Get AI Report
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">AI Analysis</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="text-xs text-gray-500 mb-4">{range.from} → {range.to}</div>
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-500">Claude is reading your numbers…</div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{report}</pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}
