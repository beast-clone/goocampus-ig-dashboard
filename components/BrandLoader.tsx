import type { CSSProperties } from "react";

// Clean, on-brand animated loader (no external library) — a small "building bars"
// motif tinted to the brand indigo, used on the slow AI waits (AI report / planner)
// where a static skeleton feels dead. Styles + keyframes live in app/globals.css
// (.brand-loader / @keyframes brandLoaderBar); this just lays out the bars and
// staggers their animation so they ripple.
export function BrandLoader({
  size = 30,
  bars = 4,
  className = "",
}: {
  size?: number;
  bars?: number;
  className?: string;
}) {
  const style: CSSProperties = { width: size, height: size };
  return (
    <span className={`brand-loader ${className}`} style={style} role="status" aria-label="Loading">
      {Array.from({ length: bars }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}
