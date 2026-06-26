"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Point = { date: string; followers: number; newFollowers: number };

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const sign = p.newFollowers >= 0 ? "+" : "";
  const color = p.newFollowers > 0 ? "text-emerald-600" : p.newFollowers < 0 ? "text-rose-600" : "text-gray-400";
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
      <div className="text-base font-semibold text-gray-900">{p.followers.toLocaleString("en-IN")}</div>
      <div className={`text-xs font-medium ${color}`}>{sign}{p.newFollowers.toLocaleString("en-IN")} that day</div>
    </div>
  );
}

export function FollowerGrowthChart({ data, totalGain }: { data: Point[]; totalGain: number }) {
  const validDays = data.filter((d) => d.newFollowers !== 0);
  const peak = validDays.length > 0 ? validDays.reduce((m, d) => d.newFollowers > m.newFollowers ? d : m) : null;
  const avg = validDays.length > 0 ? totalGain / validDays.length : 0;
  const sign = totalGain >= 0 ? "+" : "";

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Followers over time</div>
          <div className="text-2xl font-semibold text-gray-900">
            {sign}{totalGain.toLocaleString("en-IN")}
            <span className="text-xs font-normal text-gray-500 ml-2">in range</span>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5">
          <div>avg <span className="font-medium text-gray-700">{sign}{avg.toFixed(0)}/day</span></div>
          {peak && <div>best day <span className="font-medium text-emerald-600">+{peak.newFollowers} on {peak.date}</span></div>}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="followerArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              domain={["dataMin - 100", "dataMax + 100"]}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="followers"
              stroke="#7c3aed"
              strokeWidth={2.5}
              fill="url(#followerArea)"
              dot={false}
              activeDot={{ r: 5, fill: "#7c3aed", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
