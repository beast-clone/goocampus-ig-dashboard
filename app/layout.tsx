import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { FetchBasePathPatch } from "@/components/FetchBasePathPatch";
import { CommentMode } from "@/components/CommentMode";

// Load Inter once at the root so EVERY tab uses the same typeface (previously only
// Overview / Calendar / My Day loaded it, leaving the rest on the system font).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "GooCampus Instagram Dashboard",
  description: "Internal analytics dashboard for GooCampus Instagram accounts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen antialiased">
        <FetchBasePathPatch />
        {children}
        <CommentMode />
      </body>
    </html>
  );
}
