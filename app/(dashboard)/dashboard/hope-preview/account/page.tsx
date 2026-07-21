"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import {
  IconUser, IconMail, IconId, IconBriefcase, IconLock, IconShieldCheck, IconSend, IconCheck,
} from "@tabler/icons-react";

type Me = { name?: string; first?: string; initials?: string; role?: string; email?: string; id?: string; isAdmin?: boolean } | null;

export default function AccountPage() {
  return (
    <HopeDashboardShell
      active="account"
      title="My Account"
      subtitle="Your profile and sign-in — review your details and change your password."
      hideAccountPicker
      hideRange
    >
      {() => <Inner />}
    </HopeDashboardShell>
  );
}

function Inner() {
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setMe(d?.user ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand-light text-brand"><IconUser size={17} stroke={1.8} /></span>
          <h2 className="text-sm font-semibold text-[#232D42]">Profile</h2>
          {me?.isAdmin && <span className="ml-auto text-[11px] font-medium bg-brand-light text-brand rounded-full px-2.5 py-1">Admin</span>}
        </div>
        <Row icon={IconUser} label="Name" value={me?.name} />
        <Row icon={IconMail} label="Email" value={me?.email} />
        <Row icon={IconId} label="Username" value={me?.id} />
        <Row icon={IconBriefcase} label="Role" value={me?.role} />
      </div>

      <ChangePassword hasEmail={!!me?.email} />
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof IconUser; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon size={16} stroke={1.7} className="text-gray-400 shrink-0" />
      <span className="text-xs text-[#8A92A6] w-24 shrink-0">{label}</span>
      <span className="text-sm text-[#232D42] font-medium truncate">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function ChangePassword({ hasEmail }: { hasEmail: boolean }) {
  const [step, setStep] = useState<"enter" | "verify" | "done">("enter");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const valid = pw.length >= 8 && pw === pw2;

  const sendCode = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/account/otp", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Couldn't send the code.");
      setSentTo(d.sentTo || null);
      setStep("verify");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send the code."); }
    finally { setBusy(false); }
  };

  const change = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/account/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, newPassword: pw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Couldn't change the password.");
      setStep("done");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't change the password."); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand-light text-brand"><IconLock size={17} stroke={1.8} /></span>
        <h2 className="text-sm font-semibold text-[#232D42]">Change password</h2>
      </div>

      {step === "done" ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
          <IconCheck size={16} stroke={2} /> Your password has been changed. Use it the next time you sign in.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#8A92A6]">New password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={step === "verify"} placeholder="At least 8 characters"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs text-[#8A92A6]">Confirm new password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={step === "verify"} placeholder="Re-enter the password"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
            {pw2 && pw !== pw2 && <p className="text-[11px] text-rose-600 mt-1">Passwords don&apos;t match.</p>}
          </div>

          {step === "enter" ? (
            <button
              onClick={sendCode}
              disabled={!valid || busy || !hasEmail}
              title={!hasEmail ? "No email on file — ask an admin to add one" : undefined}
              className="inline-flex items-center gap-2 text-sm font-medium text-white bg-brand rounded-lg px-4 py-2 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconSend size={15} stroke={1.9} /> {busy ? "Sending…" : "Email me a verification code"}
            </button>
          ) : (
            <div className="pt-1 space-y-3">
              <div className="flex items-center gap-2 text-[12px] text-[#8A92A6] bg-brand-light/50 border border-gray-100 rounded-lg px-3 py-2">
                <IconShieldCheck size={15} className="text-brand" stroke={1.8} /> We emailed a 6-digit code to <b className="text-[#232D42]">{sentTo}</b>. Enter it below (expires in 10 minutes).
              </div>
              <div>
                <label className="text-xs text-[#8A92A6]">Verification code</label>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code"
                  className="mt-1 w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm tracking-[0.3em] font-medium" />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={change} disabled={code.length !== 6 || busy}
                  className="inline-flex items-center gap-2 text-sm font-medium text-white bg-brand rounded-lg px-4 py-2 hover:bg-[#2138B0] disabled:opacity-40 disabled:cursor-not-allowed">
                  <IconCheck size={15} stroke={2} /> {busy ? "Changing…" : "Change password"}
                </button>
                <button onClick={sendCode} disabled={busy} className="text-[12px] text-brand hover:underline disabled:opacity-40">Resend code</button>
              </div>
            </div>
          )}

          {err && <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{err}</p>}
          {!hasEmail && step === "enter" && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">No email is on file for your account, so we can&apos;t send a code. Ask an admin to add your email on the Team page.</p>
          )}
        </div>
      )}
    </div>
  );
}
