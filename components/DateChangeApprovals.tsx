"use client";
import { useEffect, useState, useCallback } from "react";

// Maheen-only panel: publish-date changes raised by others sit here until she
// approves (applies the new date) or rejects (keeps the old one). Self-hides when
// there's nothing pending or the viewer isn't the approver.
type Req = { postId: string; title: string; from: string | null; to: string | null; requestedBy: string; requestedAt: string; status: string };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// `enabled` — show only to the approver (Maheen / admin). Approvals are always
// submitted as "maheen" (the approver identity) regardless of which person the
// admin is currently viewing in My Day.
export function DateChangeApprovals({ enabled }: { enabled: boolean }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/marketing-hub/date-change")
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((d) => setReqs((d.requests || []) as Req[]))
      .catch(() => setReqs([]));
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  if (!enabled || !reqs || reqs.length === 0) return null;

  const act = async (postId: string, action: "approve" | "reject") => {
    setBusy(postId + action);
    try {
      await fetch("/api/marketing-hub/date-change", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, action, actor: "maheen" }),
      });
      setReqs((rs) => (rs || []).filter((r) => r.postId !== postId));
    } finally { setBusy(null); }
  };

  return (
    <div style={{ margin: "0 0 14px", background: "#fff", border: "1px solid #E9ECFB", borderLeft: "3px solid #3A57E8", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#232D42", marginBottom: 2 }}>
        📅 Publish-date changes to approve
        <span style={{ background: "#E9ECFB", color: "#2138B0", borderRadius: 99, padding: "1px 8px", fontSize: 12, marginLeft: 8 }}>{reqs.length}</span>
      </div>
      <div style={{ fontSize: 12, color: "#8A92A6", marginBottom: 10 }}>Someone changed a publish date — it applies only after you approve.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reqs.map((r) => (
          <div key={r.postId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #F3F5FA", paddingTop: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: "#232D42", fontWeight: 500 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#8A92A6" }}>{cap(r.requestedBy)} · {fmt(r.from)} → <b style={{ color: "#232D42" }}>{fmt(r.to)}</b></div>
            </div>
            <button disabled={!!busy} onClick={() => act(r.postId, "approve")}
              style={{ background: "#3A57E8", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Approve</button>
            <button disabled={!!busy} onClick={() => act(r.postId, "reject")}
              style={{ background: "#fff", color: "#C0392B", border: "1px solid #F0D0CE", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Reject</button>
          </div>
        ))}
      </div>
    </div>
  );
}
