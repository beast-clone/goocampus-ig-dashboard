import { BrandLoader } from "@/components/BrandLoader";

/** Centered branded loading state for a panel/table body. Matches the route-level
 * loading.tsx pattern (BrandLoader + a muted "Loading…" label) so every data
 * loader across the dashboard looks the same. */
export function LoadingBlock({
  label = "Loading…",
  size = 32,
  className = "",
}: {
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2.5 py-10 ${className}`}>
      <BrandLoader size={size} />
      {label ? <div className="text-[12px] text-[#8A92A6] font-medium">{label}</div> : null}
    </div>
  );
}
