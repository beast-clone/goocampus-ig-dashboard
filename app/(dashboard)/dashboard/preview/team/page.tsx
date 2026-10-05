"use client";
import { useEffect, useState } from "react";
import {
  IconUsersGroup, IconShieldLock, IconKey, IconMail, IconChevronDown,
  IconCheck, IconUserPlus, IconAlertTriangle,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { CAPABILITIES, GRANTABLE_SECTIONS, ROLE_PRESETS, type Capability, type Section } from "@/lib/permissions";
import { SECTION_TABS } from "@/app/(dashboard)/dashboard/preview/PreviewSidebar";

type Member = {
  id: string;
  email: string;
  name: string;
  first: string;
  initials: string;
  role: string;
  isAdmin: boolean;
  active: boolean;
  hasPassword: boolean;
  permissions: Record<string, boolean>;
  sections: Record<string, boolean>;
};

export default function TeamPage() {
  return (
    <PreviewDashboardShell active="team" title="Team & access" subtitle="Click a person to see and change what they can open and do. Everything happens in their row." hideAccountPicker hideRange>
      {() => <TeamManager />}
    </PreviewDashboardShell>
  );
}

/* ── shared bits ───────────────────────────────────────────────────────────── */

// A card with a labelled header, per the dashboard's section pattern — content
// never sits on a bare background.
function Panel({ icon, title, meta, children }: {
  icon: React.ReactNode; title: string; meta?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <header className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
        <span className="text-brand shrink-0">{icon}</span>
        <h2 className="text-[14px] font-medium text-[#232D42]">{title}</h2>
        {meta && <div className="ml-auto flex items-center gap-2">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

// Replaces the native checkbox. A switch reads as "this is a live setting that
// takes effect", which is what admin and active actually are — both write
// straight to the server on change.
function Toggle({ checked, disabled, onChange, label }: {
  checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[21px] w-[37px] items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-brand" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-[15px] w-[15px] rounded-full bg-white transition-transform ${
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

// Borderless until you touch it. Eight bordered boxes per row made the roster
// read as a spreadsheet; the border now appears on hover/focus, so the page
// looks like a list of people and still edits in place.
const FIELD =
  "w-full min-w-0 px-2.5 py-1.5 rounded-lg bg-transparent text-[13px] text-[#232D42] " +
  "border border-transparent hover:border-gray-200 focus:border-brand focus:bg-white " +
  "focus:outline-none transition-colors placeholder:text-[#A6ACBE]";

function Pill({ tone, children }: { tone: "good" | "mute" | "brand"; children: React.ReactNode }) {
  const map = {
    good: "bg-[#E8F6F0] text-[#2F9E6F]",
    mute: "bg-[#F6F7FB] text-[#8A92A6]",
    brand: "bg-brand-light text-brand",
  };
  return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

/* ── page ──────────────────────────────────────────────────────────────────── */

// One list, one row per person (docs: approved prototype "Team & access v2", 5 Oct).
// Click a person and their access opens inside their own row, in three steps:
//   1 Role — a one-click preset (Admin / Manager / Designer / Video editor /
//     Content writer / Custom) that sets steps 2 and 3;
//   2 Pages they can open — the sidebar sections, each listing its tabs (read from
//     the sidebar itself, so new tabs appear here automatically);
//   3 What they can do with tasks.
// Admins keep their own switches underneath: they're what applies if Admin is
// ever turned off, and the row says exactly what would be lost.

type Draft = { isAdmin: boolean; sections: Record<string, boolean>; permissions: Record<string, boolean>; email: string; role: string; active: boolean };
const SENSITIVE: Record<string, string> = { sales: "customer names and phone numbers", ads: "ad spend and budgets" };
const on = (r: Record<string, boolean> | undefined, k: string) => r?.[k] === true;

function roleKey(d: Pick<Draft, "isAdmin" | "sections" | "permissions">): string {
  if (d.isAdmin) return "admin";
  const secs = GRANTABLE_SECTIONS.filter((s) => on(d.sections, s.key)).map((s) => s.key);
  const caps = CAPABILITIES.filter((c) => on(d.permissions, c.key)).map((c) => c.key);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return ROLE_PRESETS.find((r) => same(secs, r.sections) && same(caps, r.caps))?.key || "custom";
}
const roleLabel = (k: string) => (k === "admin" ? "Admin" : k === "custom" ? "Custom" : ROLE_PRESETS.find((r) => r.key === k)?.label || k);

function TeamManager() {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ id: "", name: "", email: "", role: "" });

  async function load() {
    setError("");
    try {
      const r = await fetch("/api/admin/team");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Failed to load the team");
      setTeam(d.team);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the team");
      setTeam([]);
    }
  }
  useEffect(() => { load(); }, []);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  }

  async function call(method: "PATCH" | "POST", body: unknown): Promise<boolean> {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/team", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "That didn't work");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (team === null) {
    return <div className="bg-white rounded-2xl border border-gray-100 px-5 py-8 text-[13px] text-[#8A92A6]">Loading the team…</div>;
  }

  const active = team.filter((m) => m.active).length;
  const admins = team.filter((m) => m.isAdmin).length;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-[#FDECEA] border border-[#F5C6C0] px-4 py-2.5 text-[12.5px] text-[#C0392B]">{error}</div>}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl bg-[#E8F6F0] border border-[#CDEBDF] px-4 py-2.5 text-[12.5px] text-[#2F9E6F]">
          <IconCheck size={15} stroke={2} className="shrink-0" />{notice}
        </div>
      )}

      <Panel
        icon={<IconUsersGroup size={18} stroke={1.8} />}
        title="Team members"
        meta={
          <>
            <Pill tone="mute">{active} can sign in</Pill>
            <Pill tone="brand">{admins} admin</Pill>
            <button onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand text-white text-[12.5px] font-medium hover:bg-brand-dark">
              <IconUserPlus size={15} stroke={1.8} /> Add someone
            </button>
          </>
        }
      >
        {showAdd && (
          <div className="px-5 py-4 border-b border-gray-100 bg-[#FCFCFE] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {([
                ["name", "Full name", "Asha Nair"],
                ["email", "Work email", "asha@goocampus.in"],
                ["id", "Short id", "asha (lowercase, no spaces)"],
                ["role", "Job title", "Content Writer"],
              ] as const).map(([key, label, ph]) => (
                <label key={key} className="block">
                  <span className="block text-[11px] font-medium text-[#8A92A6] mb-1">{label}</span>
                  <input value={add[key]} onChange={(e) => setAdd((s) => ({ ...s, [key]: e.target.value }))} placeholder={ph}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[13px] text-[#232D42] placeholder:text-[#C9CDD8] bg-white" />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[11.5px] text-[#8A92A6] flex-1">Once added, open their row to give them a role, then send the invite so they set their own password.</p>
              <button onClick={() => setShowAdd(false)} className="text-[13px] text-[#8A92A6] hover:text-[#232D42]">Cancel</button>
              <button disabled={busy}
                onClick={async () => {
                  if (await call("POST", { action: "add", ...add })) {
                    const id = add.id.trim().toLowerCase();
                    setAdd({ id: "", name: "", email: "", role: "" }); setShowAdd(false); setOpenId(id || null);
                    flash("Added — choose what they can open and do below.");
                  }
                }}
                className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}
        <div className="p-4 space-y-2.5">
          {team.map((m) => (
            <PersonRow key={m.id} m={m} open={openId === m.id} busy={busy}
              onToggle={() => setOpenId(openId === m.id ? null : m.id)}
              onSave={async (d) => {
                const updates: Record<string, unknown> = { is_admin: d.isAdmin, sections: d.sections, permissions: d.permissions, active: d.active };
                if (d.email.trim() !== m.email) updates.email = d.email.trim();
                if (d.role.trim() !== m.role) updates.role = d.role.trim();
                if (await call("PATCH", { id: m.id, updates })) { setOpenId(null); flash(`Saved ${m.first}'s access — it applies from their next page load.`); }
              }}
              onAction={async (body, msg) => { if (await call("POST", body)) flash(msg); }}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── one person ────────────────────────────────────────────────────────────── */

function Chips({ d }: { d: Pick<Draft, "isAdmin" | "sections" | "permissions"> }) {
  if (d.isAdmin) {
    return <span className="flex flex-wrap gap-1"><span className="text-[11.5px] px-2 py-[3px] rounded-md bg-brand-light text-brand">Every page</span><span className="text-[11.5px] px-2 py-[3px] rounded-md bg-brand-light text-brand">Every task action</span><span className="text-[11.5px] px-2 py-[3px] rounded-md bg-brand-light text-brand">Settings</span></span>;
  }
  const pages = GRANTABLE_SECTIONS.filter((s) => on(d.sections, s.key));
  const caps = CAPABILITIES.filter((c) => on(d.permissions, c.key));
  return (
    <span className="flex flex-wrap gap-1">
      {pages.map((s) => <span key={s.key} className="text-[11.5px] px-2 py-[3px] rounded-md bg-[#F1F2F6] text-[#4A5468]">{s.label}</span>)}
      {caps.map((c) => <span key={c.key} className="text-[11.5px] px-2 py-[3px] rounded-md bg-[#E8F6F0] text-[#2F9E6F]">{c.short}</span>)}
      {!pages.length && <span className="text-[11.5px] px-2 py-[3px] rounded-md bg-[#FDECEA] text-[#C0392B]">can&apos;t open any page</span>}
      {!on(d.permissions, "create_tasks") && !on(d.permissions, "edit_tasks") && <span className="text-[11.5px] px-2 py-[3px] rounded-md bg-[#FDECEA] text-[#C0392B]">can&apos;t create or edit tasks</span>}
    </span>
  );
}

function SwitchRow({ title, detail, warn, checked, locked, onChange }: { title: string; detail: string; warn?: string; checked: boolean; locked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[#232D42]">{title}</div>
        <div className="text-[11.5px] leading-snug text-[#8A92A6] mt-[1px]">{detail}</div>
        {warn && <div className="text-[11px] text-[#B7791F] mt-[2px]">Shows {warn}</div>}
      </div>
      <Toggle checked={checked} disabled={locked} label={title} onChange={(v) => onChange?.(v)} />
    </div>
  );
}

function PersonRow({ m, open, busy, onToggle, onSave, onAction }: {
  m: Member; open: boolean; busy: boolean; onToggle: () => void;
  onSave: (d: Draft) => void; onAction: (body: unknown, msg: string) => void;
}) {
  const fresh = (): Draft => ({ isAdmin: m.isAdmin, sections: { ...(m.sections || {}) }, permissions: { ...(m.permissions || {}) }, email: m.email, role: m.role, active: m.active });
  const [d, setD] = useState<Draft>(fresh);
  const [pw, setPw] = useState<string | null>(null);
  // Re-read the saved values each time the row opens, so Cancel really cancels.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setD(fresh()); setPw(null); } }, [open, m]);

  const shown = open ? d : fresh();
  const role = roleKey(shown);
  const flip = (field: "sections" | "permissions", k: string, v: boolean) =>
    setD((x) => { const next = { ...x[field] }; if (v) next[k] = true; else delete next[k]; return { ...x, [field]: next }; });
  const pick = (k: string) => setD((x) => {
    if (k === "admin") return { ...x, isAdmin: true };
    const r = ROLE_PRESETS.find((p) => p.key === k);
    if (!r) return { ...x, isAdmin: false };                       // Custom: keep the switches as they are
    return { ...x, isAdmin: false, sections: Object.fromEntries(r.sections.map((s) => [s, true])), permissions: Object.fromEntries(r.caps.map((c) => [c, true])) };
  });

  const lostPages = GRANTABLE_SECTIONS.filter((s) => !on(d.sections, s.key)).map((s) => s.label);
  const lostCaps = CAPABILITIES.filter((c) => !on(d.permissions, c.key)).map((c) => c.short);
  const pagesOn = GRANTABLE_SECTIONS.filter((s) => on(d.sections, s.key)).map((s) => s.label);
  const capsOn = CAPABILITIES.filter((c) => on(d.permissions, c.key)).map((c) => c.short);

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${open ? "border-brand" : "border-gray-100"} ${m.active ? "" : "opacity-60"}`}>
      <button type="button" onClick={onToggle}
        className={`w-full text-left grid grid-cols-[minmax(220px,260px)_120px_1fr_auto] gap-4 items-center px-4 py-3 ${open ? "bg-brand-light" : "hover:bg-[#FCFCFE]"}`}>
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full bg-brand-light text-brand text-[12px] font-medium flex items-center justify-center shrink-0 border border-white">{m.initials}</span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-[#232D42] truncate">{m.name}</span>
            <span className="block text-[11.5px] text-[#8A92A6] truncate">{m.role || m.email}</span>
          </span>
        </span>
        <span>
          <span className="block text-[10px] uppercase tracking-wider text-[#A6ACBE] mb-1">Role</span>
          <span className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full ${shown.isAdmin ? "bg-brand text-white" : "bg-brand-light text-brand"}`}>{roleLabel(role)}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wider text-[#A6ACBE] mb-1">Can open and do{!m.active && " · can't sign in"}</span>
          <Chips d={shown} />
        </span>
        <span className="text-[12.5px] text-brand inline-flex items-center gap-1 whitespace-nowrap">
          {open ? "Close" : "Change access"}
          <IconChevronDown size={14} stroke={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pt-4 pb-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1 · Role */}
            <div>
              <StepTitle n="1" title="Role" hint="Pick one — it sets the switches. You can still change any switch after." />
              <div className="space-y-1.5">
                {[{ key: "admin", label: "Admin", desc: "Everything, including this page and Settings" }, ...ROLE_PRESETS, { key: "custom", label: "Custom", desc: "Your own mix of switches" }].map((r) => {
                  const sel = roleKey(d) === r.key;
                  return (
                    <button key={r.key} type="button" onClick={() => pick(r.key)}
                      className={`w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${sel ? "border-brand bg-brand-light" : "border-gray-200 hover:border-brand"}`}>
                      <span className={`mt-[2px] w-4 h-4 rounded-full shrink-0 ${sel ? "border-[5px] border-brand" : "border-[1.5px] border-[#C8CDD9]"}`} />
                      <span><span className="block text-[13px] font-medium text-[#232D42]">{r.label}</span><span className="block text-[11.5px] text-[#8A92A6] leading-snug">{r.desc}</span></span>
                    </button>
                  );
                })}
              </div>
              {m.isAdmin && !d.isAdmin && (
                <div className="mt-2.5 flex gap-2 rounded-lg bg-[#FDF6E7] px-3 py-2 text-[12px] leading-relaxed text-[#8A5A00]">
                  <IconAlertTriangle size={15} stroke={1.8} className="shrink-0 mt-[2px]" />
                  <span><span className="font-medium">Taking away Admin.</span> {m.first} will lose Settings{lostPages.length ? `, ${lostPages.join(", ")}` : ""}{lostCaps.length ? ` and won't be able to ${lostCaps.join(", ")}` : ""}.</span>
                </div>
              )}
            </div>

            {/* 2 · Pages */}
            <div>
              <StepTitle n="2" title="Pages they can open" hint="Off = hidden from their sidebar." />
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                {GRANTABLE_SECTIONS.map((s) => (
                  <SwitchRow key={s.key} title={s.label} detail={SECTION_TABS[s.key].join(", ")} warn={SENSITIVE[s.key]}
                    checked={d.isAdmin || on(d.sections, s.key)} locked={d.isAdmin || busy} onChange={(v) => flip("sections", s.key, v)} />
                ))}
                <SwitchRow title="Settings" detail={`${SECTION_TABS.system.join(", ")} — Admins only`} checked={d.isAdmin} locked />
              </div>
            </div>

            {/* 3 · Tasks */}
            <div>
              <StepTitle n="3" title="What they can do with tasks" hint="Inside the pages they can open." />
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                {CAPABILITIES.map((c) => (
                  <SwitchRow key={c.key} title={c.label} detail={c.desc}
                    checked={d.isAdmin || on(d.permissions, c.key)} locked={d.isAdmin || busy} onChange={(v) => flip("permissions", c.key, v as boolean)} />
                ))}
              </div>
            </div>
          </div>

          {/* Details + sign-in */}
          <div className="mt-4 rounded-lg border border-gray-100 px-3 py-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block"><span className="block text-[11px] text-[#8A92A6] mb-1">Work email</span><input value={d.email} onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))} className={`${FIELD} border-gray-200`} /></label>
            <label className="block"><span className="block text-[11px] text-[#8A92A6] mb-1">Job title</span><input value={d.role} onChange={(e) => setD((x) => ({ ...x, role: e.target.value }))} className={`${FIELD} border-gray-200`} /></label>
            <label className="flex items-center gap-2 pb-1.5 text-[12.5px] text-[#232D42]"><Toggle checked={d.active} disabled={busy} label="Can sign in" onChange={(v) => setD((x) => ({ ...x, active: v }))} /> Can sign in</label>
            <div className="md:col-span-3 flex items-center gap-3 flex-wrap text-[12px]">
              <Pill tone={m.hasPassword ? "good" : "mute"}>{m.hasPassword ? "Own password" : "Shared team password"}</Pill>
              <button disabled={busy || !m.email} onClick={() => onAction({ action: "invite", id: m.id }, `Invite emailed to ${m.first} — they'll set their own password.`)}
                className="inline-flex items-center gap-1 text-brand hover:underline disabled:text-[#C9CDD8]"><IconMail size={14} stroke={1.8} />{m.hasPassword ? "Re-send invite" : "Send invite"}</button>
              {pw === null ? (
                <button onClick={() => setPw("")} className="inline-flex items-center gap-1 text-[#8A92A6] hover:text-[#232D42]"><IconKey size={14} stroke={1.8} />{m.hasPassword ? "Change password" : "Set password"}</button>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <input autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" className="w-52 px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[12.5px] text-[#232D42]" />
                  <button disabled={busy || pw.length < 8} onClick={() => { onAction({ action: "set_password", id: m.id, password: pw }, `${m.first}'s password is set — share it with them privately.`); setPw(null); }}
                    className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-[11.5px] font-medium disabled:opacity-50">Set</button>
                  <button onClick={() => setPw(null)} className="text-[#8A92A6]">Cancel</button>
                </span>
              )}
              {m.hasPassword && (
                <button disabled={busy} onClick={() => onAction({ action: "clear_password", id: m.id }, `${m.first} is back on the shared password.`)} className="text-[#A6ACBE] hover:text-[#C0392B]">Back to shared password</button>
              )}
            </div>
          </div>

          {/* In short + save */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            <p className="flex-1 min-w-[260px] text-[12.5px] leading-relaxed text-[#4A5468]">
              <IconShieldLock size={14} stroke={1.8} className="inline -mt-[2px] mr-1 text-[#8A92A6]" />
              {d.isAdmin
                ? <><span className="font-medium text-[#232D42]">{m.first} has full access</span> — every page, every task action, and Settings.</>
                : <><span className="font-medium text-[#232D42]">{m.first}</span> will be able to open <span className="font-medium text-[#232D42]">{pagesOn.join(", ") || "nothing"}</span>
                  {capsOn.length ? <> and <span className="font-medium text-[#232D42]">{capsOn.join(", ")}</span>.</> : <>, but <span className="text-[#C0392B]">not create or edit tasks</span>.</>}</>}
              {!d.active && <span className="text-[#C0392B]"> They can&apos;t sign in.</span>}
            </p>
            <button onClick={onToggle} className="h-9 px-4 rounded-lg border border-gray-200 text-[13px] text-[#232D42] hover:border-brand hover:text-brand">Cancel</button>
            <button disabled={busy} onClick={() => onSave(d)} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepTitle({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-[#232D42]">
        <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] grid place-items-center">{n}</span>{title}
      </div>
      <p className="ml-7 text-[11.5px] text-[#8A92A6]">{hint}</p>
    </div>
  );
}
