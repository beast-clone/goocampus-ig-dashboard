import { Inter } from "next/font/google";
import { HopeMyDay } from "./HopeMyDay";

// Hope UI reskin — My Day (Version 2 preview). Self-contained: its own Hope-themed
// shell + the full decluttered My Day layout. Does not touch the shared
// Sidebar/DashboardShell or the original components/MyDayView.tsx (Version 1).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export default function HopeMyDayPage() {
  return (
    <div className={inter.className}>
      <HopeMyDay />
    </div>
  );
}
