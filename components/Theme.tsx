"use client";
import { useEffect, useState } from "react";
import { IconSun, IconMoon, IconDeviceDesktop } from "@tabler/icons-react";

// Light / Dark / System theme (Nikhil's comment). The choice is saved per ACCOUNT
// (ind_users.theme via PATCH /api/account/profile) and mirrored to localStorage so
// the inline script in app/layout.tsx can paint the right theme before React loads.
// "system" follows the OS and switches live when it changes.
// The dark palette itself is one block in app/globals.css (html[data-theme="dark"]).
export type ThemePref = "light" | "dark" | "system";
const LS = "gc.theme";
const EVT = "gc-theme";
const mq = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && mq().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
const readPref = (): ThemePref => {
  try { const v = localStorage.getItem(LS); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* ignore */ }
  return "system";
};

export function setThemePref(pref: ThemePref, save = true) {
  try { localStorage.setItem(LS, pref); } catch { /* ignore */ }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVT, { detail: pref }));
  if (save) fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: pref }) }).catch(() => {});
}

// Mounted once (app/(dashboard)/layout.tsx): pulls the account's saved theme and
// keeps "system" in step with the OS.
export function ThemeSync() {
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const t = d?.user?.theme;
      if ((t === "light" || t === "dark" || t === "system") && t !== readPref()) setThemePref(t, false);
    }).catch(() => {});
    const onOs = () => { if (readPref() === "system") applyTheme("system"); };
    const m = mq();
    m.addEventListener("change", onOs);
    return () => m.removeEventListener("change", onOs);
  }, []);
  return null;
}

export function useThemePref(): ThemePref {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(readPref());
    const on = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return pref;
}

// Light · Dark · System segmented switch. `compact` = icons only (sidebar footer).
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const pref = useThemePref();
  const opts: { v: ThemePref; label: string; Icon: typeof IconSun }[] = [
    { v: "light", label: "Light", Icon: IconSun },
    { v: "dark", label: "Dark", Icon: IconMoon },
    { v: "system", label: "System", Icon: IconDeviceDesktop },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-[#F6F7FB] p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map(({ v, label, Icon }) => (
        <button key={v} role="radio" aria-checked={pref === v} title={v === "system" ? "System — follows your computer's setting" : label}
          onClick={() => setThemePref(v)}
          className={`inline-flex items-center gap-1.5 rounded-md ${compact ? "h-7 w-8 justify-center" : "h-8 px-3"} text-[13px] font-medium transition ${pref === v ? "bg-white text-[#3A57E8] border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
          <Icon size={15} stroke={1.8} />{!compact && label}
        </button>
      ))}
    </div>
  );
}
