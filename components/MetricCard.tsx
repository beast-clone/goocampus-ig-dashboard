export function MetricCard({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  const up = (delta ?? 0) >= 0;
  return (
    // the dashboard theme: flat white card (no drop shadow), ink value, muted label.
    <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-brand/40 transition-colors">
      <div className="text-[11px] tracking-[0.06em] uppercase font-semibold text-[#8A92A6]">{label}</div>
      <div className="mt-2.5 text-[1.7rem] leading-none font-semibold text-[#232D42] tabular-nums">{value}</div>
      {delta !== undefined && (
        <div className={`mt-2 text-xs font-medium ${up ? "text-emerald-600" : "text-rose-600"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs previous
        </div>
      )}
    </div>
  );
}
