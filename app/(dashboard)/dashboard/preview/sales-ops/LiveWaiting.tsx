"use client";
import { useEffect, useState } from "react";
import { IconClock } from "@tabler/icons-react";

// A red stopwatch that ticks every second: "HH:MM:SS" (or "Nd HH:MM:SS" past a day),
// counting how long a lead has been waiting — for first contact, or to be assigned.
// Shared by the first-contact tracker and the Unassigned-leads tab.
export function LiveWaiting({ createdAt }: { createdAt: string }) {
  const start = Date.parse(createdAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (Number.isNaN(start)) return <span className="text-gray-400">—</span>;
  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  let s = totalSec;
  const d = Math.floor(s / 86_400); s -= d * 86_400;
  const h = Math.floor(s / 3_600); s -= h * 3_600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (n: number) => String(n).padStart(2, "0");
  const clock = `${p(h)}:${p(m)}:${p(s)}`;
  // Amber while within the first 24 hours, red once it's overdue past 24h.
  const color = totalSec >= 86_400 ? "#C0392B" : "#B7791F";
  return (
    <span className="inline-flex items-center gap-1 tabular-nums font-semibold" style={{ color }} title="Waiting since the lead arrived — live (red after 24h)">
      <IconClock size={13} stroke={2} /> {d > 0 ? `${d}d ${clock}` : clock}
    </span>
  );
}
