"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// PUBLIC per-post lead form. The link a lead taps from the Instagram auto-DM, e.g.
//   /lead/gulf-webinar?kw=gulf
// The [source] segment + ?kw= are the hidden source/keyword — so the post attribution
// is guaranteed. On submit it writes one clean row to mh_dm_leads, which the dashboard
// Inbox reads. Not behind the dashboard login (middleware only gates /dashboard/*).

const pretty = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function LeadFormPage() {
  const params = useParams();
  const source = decodeURIComponent(String(params?.source || ""));
  const [keyword, setKeyword] = useState("");
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "", query: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { setKeyword(new URLSearchParams(window.location.search).get("kw") || ""); } catch { /* noop */ }
  }, []);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const canSubmit = f.first_name.trim() && f.email.trim() && f.phone.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/lead-form/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, source, keyword }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setDone(true);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F7FB", padding: "24px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#fff", border: "1px solid #EDEFF4", borderRadius: 20, overflow: "hidden" }}>
        {/* brand header */}
        <div style={{ background: "#3A57E8", color: "#fff", padding: "20px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>GooCampus</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Medical pathways abroad — NEET, MBBS/MD, PLAB, AMC, USMLE</div>
        </div>

        {done ? (
          <div style={{ padding: "40px 28px", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E3F5EA", color: "#137A3E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 14px" }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#232D42" }}>Thank you, {f.first_name || "there"}!</div>
            <p style={{ fontSize: 14, color: "#6A7286", lineHeight: 1.55, marginTop: 8 }}>
              We&rsquo;ve received your details. A GooCampus counsellor will reach out within 24–48 hours about your query.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ padding: "24px 24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#232D42" }}>Share your details</div>
            <p style={{ fontSize: 13, color: "#8A92A6", margin: "4px 0 18px", lineHeight: 1.5 }}>
              {source ? <>You asked about <b style={{ color: "#3A57E8" }}>{pretty(source)}</b>. </> : null}
              Fill this and we&rsquo;ll send the details + a counsellor will help you.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="First name" required value={f.first_name} onChange={(v) => set("first_name", v)} />
              <Field label="Last name" value={f.last_name} onChange={(v) => set("last_name", v)} />
            </div>
            <Field label="Email" type="email" required value={f.email} onChange={(v) => set("email", v)} />
            <Field label="Phone" type="tel" required value={f.phone} onChange={(v) => set("phone", v)} />
            <Field label="Your question" textarea value={f.query} onChange={(v) => set("query", v)} placeholder="e.g. Am I eligible for AMC with an Indian MBBS?" />

            {err && <div style={{ fontSize: 12.5, color: "#C03221", background: "#FBE4EC", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>{err}</div>}

            <button type="submit" disabled={!canSubmit || busy}
              style={{ width: "100%", padding: "12px", border: 0, borderRadius: 12, background: !canSubmit || busy ? "#B9C2F4" : "#3A57E8", color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: !canSubmit || busy ? "default" : "pointer" }}>
              {busy ? "Sending…" : "Submit"}
            </button>
            <div style={{ fontSize: 11, color: "#A6ACBE", textAlign: "center", marginTop: 10 }}>Your details are used only by GooCampus counsellors.</div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, textarea, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; textarea?: boolean; placeholder?: string;
}) {
  const base: React.CSSProperties = { width: "100%", border: "1px solid #DEE2EC", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#232D42", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#4A5468", display: "block", marginBottom: 5 }}>{label}{required && <span style={{ color: "#C03221" }}> *</span>}</span>
      {textarea
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} style={{ ...base, resize: "vertical" }} />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={base} />}
    </label>
  );
}
