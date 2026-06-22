import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GooCampus Instagram Dashboard",
  description: "Internal analytics dashboard for GooCampus Instagram accounts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
