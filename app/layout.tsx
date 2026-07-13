import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { FetchBasePathPatch } from "@/components/FetchBasePathPatch";
import { CommentMode } from "@/components/CommentMode";

// Hope UI reskin — Inter across the whole app.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: "GooCampus Instagram Dashboard",
  description: "Internal analytics dashboard for GooCampus Instagram accounts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen antialiased`}>
        <FetchBasePathPatch />
        {children}
        <CommentMode />
      </body>
    </html>
  );
}
