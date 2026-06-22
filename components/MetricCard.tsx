export function MetricCard({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-xs text-gray-500 uppercase font-medium">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {delta !== undefined && (
        <div className={`mt-1 text-xs ${up ? "text-green-600" : "text-red-600"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs previous
        </div>
      )}
    </div>
  );
}
