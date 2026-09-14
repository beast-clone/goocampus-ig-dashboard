"use client";
import { useCallback, useEffect, useState } from "react";
import { IconCalendarStats, IconCalendarDue, IconRefresh, IconArrowRight } from "@tabler/icons-react";

// Approvals — the admin's queue of publish-date changes waiting for sign-off. A
// non-admin moving a task's publish date parks it here (via /api/marketing-hub/
// date-change); Maheen approves (writes the new date) or rejects (keeps the old).
// Its own small tab, badged in the sidebar, so it never clutters another page.

type DateReq = { postId: string; title: string; type?: string; owner?: string; createdAt?: string; creator?: string; from: string | null; to: string | null; reason?: string; requestedBy: string };

const fmtFull = (d?: string | null) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
const nameCap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

export function Approvals() {
  const [reqs, setReqs] = useState<DateReq[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    fetch("/api/marketing-hub/date-change", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((d) => { setReqs((d.requests || []) as DateReq[]); setFetchedAt(new Date()); })
      .catch(() => setReqs([]));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const resolve = async (postId: string, action: "approve" | "reject") => {
    setBusy(postId + action);
    try {
      await fetch("/api/marketing-hub/date-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, action, actor: "maheen" }) });
      setReqs((rs) => (rs || []).filter((r) => r.postId !== postId));
    } finally { setBusy(null); }
  };

  const list = reqs || [];
  return (
    <main className="appr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ap-hero">
        <div>
          <div className="ap-h1"><IconCalendarStats size={22} stroke={1.7} /> Approvals</div>
          <div className="ap-sub">Publish-date changes waiting for your sign-off{fetchedAt ? ` · updated ${fetchedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        </div>
        <div className="ap-right">
          <span className="ap-count">{list.length} pending</span>
          <button className="ap-refresh" onClick={load} title="Refresh"><IconRefresh size={16} stroke={1.8} /></button>
        </div>
      </div>

      {reqs === null ? (
        <div className="ap-empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="ap-empty"><div className="ap-empty-ic">✓</div>No approvals needed right now.</div>
      ) : (
        <div className="ap-list">
          {list.map((r) => (
            <div key={r.postId} className="ap-card">
              <div className="ap-main">
                <div className="ap-title"><a href={`/dashboard/preview/marketing-hub?open=${r.postId}`}>{r.title}</a>{r.type && <span className="ap-type">{r.type}</span>}</div>
                <div className="ap-move"><IconCalendarDue size={14} stroke={1.9} /> <b>{fmtFull(r.from)}</b> <IconArrowRight size={13} stroke={1.9} className="arw" /> <b className="to">{fmtFull(r.to)}</b></div>
                <div className="ap-meta">Assigned to <b>{nameCap(r.owner)}</b> · Requested by <b>{nameCap(r.requestedBy)}</b>{r.createdAt ? <> · Created {fmtFull(r.createdAt)}{r.creator ? <> by <b>{nameCap(r.creator)}</b></> : null}</> : null}</div>
                <div className="ap-reason"><b>Reason:</b> {r.reason?.trim() ? r.reason : <span className="muted">not given</span>}</div>
              </div>
              <div className="ap-actions">
                <button className="ap-btn ghost" disabled={!!busy} onClick={() => resolve(r.postId, "reject")}>Reject</button>
                <button className="ap-btn primary" disabled={!!busy} onClick={() => resolve(r.postId, "approve")}>Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const CSS = `
.appr{--brand:#3A57E8;--brand-ink:#2138B0;--brand-soft:#E9ECFB;--ink:#232D42;--soft:#8A92A6;--line:#EEF0F4;--panel:#fff;--canvas:#F6F7FB;
  flex:1;min-width:0;height:100vh;overflow-y:auto;background:var(--canvas);padding:22px 26px 60px;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.appr *{box-sizing:border-box}
.appr .ap-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 20px;flex-wrap:wrap}
.appr .ap-h1{display:flex;align-items:center;gap:9px;font-size:1.35rem;font-weight:600}
.appr .ap-h1 svg{color:var(--brand)}
.appr .ap-sub{font-size:.82rem;color:var(--soft);margin-top:3px}
.appr .ap-right{display:flex;align-items:center;gap:12px}
.appr .ap-count{background:var(--brand-soft);color:var(--brand-ink);border-radius:99px;padding:4px 12px;font-size:.78rem;font-weight:600}
.appr .ap-refresh{border:1px solid var(--line);background:var(--panel);border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--soft);cursor:pointer}
.appr .ap-refresh:hover{color:var(--brand);border-color:var(--brand-soft)}
.appr .ap-empty{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:44px;text-align:center;color:var(--soft);font-size:.9rem;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.appr .ap-empty-ic{width:40px;height:40px;border-radius:50%;background:#E4F6EC;color:#127A43;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700}
.appr .ap-list{display:flex;flex-direction:column;gap:12px;margin-top:16px;max-width:860px}
.appr .ap-card{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:14px;padding:15px 17px}
.appr .ap-main{flex:1;min-width:240px}
.appr .ap-title{font-size:.95rem;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.appr .ap-title a{color:var(--ink);text-decoration:none;border-bottom:1px dashed #B9C2E0}
.appr .ap-title a:hover{color:var(--brand)}
.appr .ap-type{font-size:.68rem;background:#F3F5FA;color:#3B4457;border-radius:99px;padding:1px 8px;font-weight:500}
.appr .ap-move{font-size:.84rem;color:var(--ink);margin-top:6px;display:flex;align-items:center;gap:5px}
.appr .ap-move svg{color:var(--brand)}.appr .ap-move .to{color:var(--brand)}.appr .ap-move .arw{color:var(--soft)}
.appr .ap-meta{font-size:.76rem;color:var(--soft);margin-top:5px;line-height:1.5}
.appr .ap-meta b{color:#3B4457;font-weight:600}
.appr .ap-reason{font-size:.8rem;color:#3B4457;margin-top:7px;background:#FAFBFF;border:1px solid #EEF1FD;border-radius:8px;padding:7px 10px}
.appr .ap-reason .muted{color:var(--soft)}
.appr .ap-actions{display:flex;gap:8px;flex-shrink:0}
.appr .ap-btn{border-radius:8px;padding:8px 16px;font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit}
.appr .ap-btn.primary{background:var(--brand);color:#fff}.appr .ap-btn.primary:hover{background:var(--brand-ink)}
.appr .ap-btn.ghost{background:#fff;color:#C0392B;border-color:#F0D0CE}.appr .ap-btn.ghost:hover{background:#FDF3F2}
.appr .ap-btn:disabled{opacity:.55;cursor:default}
@media(max-width:600px){.appr{padding:16px 14px 40px}}
`;
