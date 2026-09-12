import { BrandLoader } from "@/components/BrandLoader";

// Route-transition fallback for the whole Version-2 area. Next.js shows this the
// instant you navigate between tabs, while the next page's server component +
// data are still loading — so switching tabs never looks "stuck" on the old page.
// The sidebar lives in layout.tsx and stays mounted; only this main column swaps.
export default function PreviewLoading() {
  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F6F7FB",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <BrandLoader size={40} />
        <div style={{ fontSize: 13, color: "#8A92A6", fontWeight: 500 }}>Loading…</div>
      </div>
    </main>
  );
}
