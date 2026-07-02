"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// Single-line trend used across the dashboard (Overview, Ads over-time charts, etc).
// Rendered as an AreaChart with a violet-to-transparent linearGradient fill so the
// line stays crisp on top but the space beneath conveys the volume/direction at a glance.
export function TrendChart({ title, data, dataKey }: {
  title: string;
  data: { date: string; [k: string]: number | string }[];
  dataKey: string;
}) {
  // Unique gradient id per instance so multiple TrendCharts on one page don't share
  // the same defs (which would break if e.g. we ever varied the colour per chart).
  const gradId = `trendArea-${dataKey}`;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6E48F8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6E48F8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#6E48F8"
              strokeWidth={2}
              fill={`url(#${gradId})`}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
