"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";

const AGE = [
  { bucket: "13–17", pct: 4 }, { bucket: "18–24", pct: 38 }, { bucket: "25–34", pct: 41 },
  { bucket: "35–44", pct: 12 }, { bucket: "45–54", pct: 3 }, { bucket: "55+", pct: 2 },
];
const GENDER = [{ label: "Female", pct: 54 }, { label: "Male", pct: 45 }, { label: "Unspecified", pct: 1 }];
const CITIES = [
  { name: "Bengaluru", pct: 14 }, { name: "Hyderabad", pct: 11 }, { name: "Mumbai", pct: 9 },
  { name: "Chennai", pct: 8 }, { name: "Delhi", pct: 7 }, { name: "Kochi", pct: 5 }, { name: "Pune", pct: 4 },
];
const COUNTRIES = [
  { name: "India", pct: 72 }, { name: "UAE", pct: 6 }, { name: "USA", pct: 5 },
  { name: "UK", pct: 4 }, { name: "Australia", pct: 3 }, { name: "Canada", pct: 2 },
];
const ONLINE_HOURS = Array.from({ length: 24 }, (_, h) => ({
  date: `${h}:00`,
  followers: 200 + Math.round(Math.max(0, Math.sin((h - 6) / 4) * 1800)) + (h >= 18 && h <= 22 ? 1500 : 0),
}));

export default function AudiencePage() {
  return (
    <DashboardShell title="Audience">
      {() => (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Total followers" value="48,210" delta={3.4} />
            <MetricCard label="New this month" value="+1,640" delta={12.1} />
            <MetricCard label="Unfollows this month" value="-280" />
            <MetricCard label="Net growth" value="+1,360" delta={9.4} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card title="Age">
              {AGE.map((a) => (
                <Bar key={a.bucket} label={a.bucket} pct={a.pct} />
              ))}
            </Card>
            <Card title="Gender">
              {GENDER.map((g) => (
                <Bar key={g.label} label={g.label} pct={g.pct} />
              ))}
            </Card>
            <Card title="Top cities">
              {CITIES.map((c) => (
                <Bar key={c.name} label={c.name} pct={c.pct} />
              ))}
            </Card>
            <Card title="Top countries">
              {COUNTRIES.map((c) => (
                <Bar key={c.name} label={c.name} pct={c.pct} />
              ))}
            </Card>
          </div>

          <TrendChart title="When your followers are online (hour of day)" data={ONLINE_HOURS} dataKey="followers" />
        </>
      )}
    </DashboardShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-sm font-medium mb-4">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
