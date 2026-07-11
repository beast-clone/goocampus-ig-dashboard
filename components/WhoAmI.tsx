"use client";
import { useState } from "react";

const TEAM = [
  { id: "maheen", name: "Maheen Ejaz", role: "Manager" },
  { id: "manya", name: "Manya BM", role: "Content" },
  { id: "nikhil", name: "Nikhil", role: "Design" },
  { id: "nandu", name: "Nandu", role: "Video" },
  { id: "praveen", name: "Praveen", role: "Ads" },
];

// Shown at /me when the session is valid but has no identity yet.
// Picking a name upgrades the existing session (no password) then reloads into the dashboard.
export default function WhoAmI() {
  const [busy, setBusy] = useState("");
  async function pick(id: string) {
    setBusy(id);
    await fetch("/api/whoami", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: id }),
    });
    window.location.reload();
  }
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F8FB", fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto" }}>
      <div style={{ width: 380, background: "#fff", border: "1px solid #EAECF1", borderRadius: 16, padding: 28, boxShadow: "0 1px 3px rgba(20,21,28,.06)" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 600, color: "#14151C" }}>Who are you?</h1>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>Pick your name to open your personal dashboard.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TEAM.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              disabled={!!busy}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "12px 15px", borderRadius: 10, border: "1px solid #EAECF1", background: busy === t.id ? "#F2EFFE" : "#fff", fontWeight: 500, fontSize: 14, color: "#14151C", cursor: busy ? "default" : "pointer" }}
            >
              <span>{t.name}</span>
              <span style={{ fontSize: 12, color: "#9BA1AD" }}>{t.role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
