"use client";
import { useEffect, useState, useCallback } from "react";

// Maheen-only panel: publish-date changes raised by others sit here until she
// approves (applies the new date) or rejects (keeps the old one). Self-hides when
// there's nothing pending or the viewer isn't the approver.
type Req = { postId: string; title: string; type?: string; owner?: string; createdAt?: string; creator?: string; from: string | null; to: string | null; reason?: string; requestedBy: string; requestedAt: string; status: string };

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

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
          <div key={r.postId} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", borderTop: "1px solid #F3F5FA", paddingTop: 10 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13.5, color: "#232D42", fontWeight: 600 }}>
                {r.title}
                {r.type ? <span style={{ marginLeft: 8, fontSize: 11, background: "#F3F5FA", color: "#3B4457", borderRadius: 99, padding: "1px 8px", fontWeight: 500 }}>{r.type}</span> : null}
              </div>
              <div style={{ fontSize: 12.5, color: "#232D42", marginTop: 5 }}>
                📅 <b>{fmt(r.from)}</b> → <b style={{ color: "#3A57E8" }}>{fmt(r.to)}</b>
              </div>
              <div style={{ fontSize: 11.5, color: "#8A92A6", marginTop: 3, lineHeight: 1.55 }}>
                Assigned to <b style={{ color: "#3B4457" }}>{cap(r.owner)}</b> · Requested by <b style={{ color: "#3B4457" }}>{cap(r.requestedBy)}</b><br />
                Created {fmtDT(r.createdAt)}{r.creator ? <> by <b style={{ color: "#3B4457" }}>{cap(r.creator)}</b></> : null}
              </div>
              <div style={{ fontSize: 12, color: "#3B4457", marginTop: 5, background: "#FAFBFF", border: "1px solid #EEF1FD", borderRadius: 8, padding: "6px 9px" }}>
                <b>Reason:</b> {r.reason?.trim() ? r.reason : <span style={{ color: "#8A92A6" }}>not given</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button disabled={!!busy} onClick={() => act(r.postId, "approve")}
                style={{ background: "#3A57E8", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Approve</button>
              <button disabled={!!busy} onClick={() => act(r.postId, "reject")}
                style={{ background: "#fff", color: "#C0392B", border: "1px solid #F0D0CE", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
