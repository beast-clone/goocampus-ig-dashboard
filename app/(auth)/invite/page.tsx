"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Where an invited teammate lands. They arrive with an email from an admin holding
// their address and a 6-digit code; here they choose a password and are sent
// straight to the login screen. Deliberately public — they have no account yet.
// Styled to match /login so the first screen they see is recognisably the same app.

const ACCENT = "#2F39E8";
const TEAL = "#5FE9C4";
const MIN_LEN = 8;

const field =
  "w-full px-4 py-3.5 rounded-xl border-2 text-[14px] placeholder:text-gray-300 focus:outline-none transition";

export default function InvitePage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Let an admin share a prefilled link (/invite?email=…) without ever putting the
  // code in a URL — a code in a link would be logged by every proxy in between.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
  }, []);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (password.length < MIN_LEN) return setError(`Password must be at least ${MIN_LEN} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");

    setLoading(true);
    const res = await fetch("/api/account/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword: password }),
    });
    setLoading(false);

    let body: { error?: string; name?: string } = {};
    try { body = await res.json(); } catch {}
    if (!res.ok) return setError(body.error || "Couldn't set your password. Try again.");

    setDone(body.name || "");
    setTimeout(() => router.push("/login"), 2200);
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8" style={{ background: "#EDEFF5" }}>
      <div className="w-full max-w-[1040px] bg-white rounded-[28px] shadow-[0_20px_60px_-20px_rgba(20,21,60,0.25)] overflow-hidden grid grid-cols-1 lg:grid-cols-2">

        {/* LEFT — form */}
        <div className="px-8 sm:px-12 py-10 sm:py-14 flex flex-col">
          <div className="text-[13px] text-gray-400 mb-10">
            GooCampus <span className="font-medium" style={{ color: ACCENT }}>Marketing OS</span>
          </div>

          <div className="my-auto max-w-[360px] w-full mx-auto lg:mx-0">
            {done !== null ? (
              <>
                <h1 className="text-[34px] sm:text-[38px] font-bold tracking-tight text-gray-900 leading-none">
                  You&rsquo;re all set{done ? `, ${done}` : ""}.
                </h1>
                <p className="text-[13.5px] text-gray-400 mt-4 leading-relaxed">
                  Your password is saved. Taking you to the sign-in screen…
                </p>
                <a href="/login" className="inline-block mt-6 text-[13.5px] font-medium" style={{ color: ACCENT }}>
                  Go to sign in
                </a>
              </>
            ) : (
              <>
                <h1 className="text-[34px] sm:text-[38px] font-bold tracking-tight text-gray-900 leading-none">Set up your access</h1>
                <p className="text-[13.5px] text-gray-400 mt-3 leading-relaxed">
                  Enter the code from your invite email,<br />then choose a password of your own.
                </p>

                <form onSubmit={submit} className="mt-8 space-y-4">
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1.5 bg-white text-[11px] font-medium" style={{ color: ACCENT }}>E-mail</label>
                    <input
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@goocampus.in" autoComplete="username" className={field}
                      style={{ borderColor: "#E3E5EE" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#E3E5EE")}
                    />
                  </div>

                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1.5 bg-white text-[11px] font-medium text-gray-400">Invite code</label>
                    <input
                      required value={code} inputMode="numeric" maxLength={6} autoFocus
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code" className={`${field} tracking-[6px] font-medium`}
                      style={{ borderColor: "#E3E5EE" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#E3E5EE")}
                    />
                  </div>

                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1.5 bg-white text-[11px] font-medium text-gray-400">New password</label>
                    <input
                      type={show ? "text" : "password"} required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`At least ${MIN_LEN} characters`} autoComplete="new-password"
                      className={`${field} pr-11`} style={{ borderColor: "#E3E5EE" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#E3E5EE")}
                    />
                    <button type="button" onClick={() => setShow((v) => !v)}
                      aria-label={show ? "Hide password" : "Show password"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition">
                      {show ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1.5 bg-white text-[11px] font-medium text-gray-400">Confirm password</label>
                    <input
                      type={show ? "text" : "password"} required value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Type it again" autoComplete="new-password"
                      className={field} style={{ borderColor: "#E3E5EE" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#E3E5EE")}
                    />
                  </div>

                  {error && <p className="text-[13px] text-red-500">{error}</p>}

                  <button disabled={loading}
                    className="w-full py-3.5 rounded-xl text-white text-[14px] font-semibold disabled:opacity-60 transition hover:brightness-95"
                    style={{ background: ACCENT }}>
                    {loading ? "Setting up…" : "Set my password"}
                  </button>

                  <p className="text-[12px] text-gray-400 pt-1">
                    Already set yours up? <a href="/login" className="font-medium" style={{ color: ACCENT }}>Sign in</a>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>

        {/* RIGHT — branded panel */}
        <div className="hidden lg:flex relative m-3 rounded-[22px] overflow-hidden flex-col justify-center px-12" style={{ background: ACCENT }}>
          <div className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: "radial-gradient(circle at 70% 40%, transparent 0, transparent 38%, white 38.4%, transparent 39%), radial-gradient(circle at 70% 40%, transparent 0, transparent 50%, white 50.4%, transparent 51%), radial-gradient(circle at 70% 40%, transparent 0, transparent 62%, white 62.4%, transparent 63%)" }} />
          <div className="relative">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-7" style={{ background: TEAL }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div className="pl-5 border-l border-white/25">
              <h2 className="text-white font-bold tracking-tight leading-[0.95] text-[52px]">Welcome<br />to the team.</h2>
              <p className="text-white/70 text-[14px] leading-relaxed mt-8 max-w-[330px]">
                Your day, your leads, your posts — all in one place. Pick a password and you&rsquo;re in.
              </p>
              <p className="text-white/50 text-[12.5px] leading-relaxed mt-7 max-w-[330px]">
                Nobody at GooCampus can see the password you choose. If your code has expired, ask whoever invited you to send a new one.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
