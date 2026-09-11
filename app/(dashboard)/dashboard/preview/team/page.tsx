"use client";
import { Fragment, useEffect, useState } from "react";
import {
  IconUsersGroup, IconShieldLock, IconKey, IconMail, IconChevronDown,
  IconCheck, IconUserPlus, IconInfoCircle, IconLayoutGrid, IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { CAPABILITIES, PRESETS, GRANTABLE_SECTIONS, ROLE_PRESETS, type Capability, type Section } from "@/lib/permissions";

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
    <PreviewDashboardShell active="team" title="Team" subtitle="Who can sign in, what they can open, and their passwords." hideAccountPicker>
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

function TeamManager() {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Per-row unsaved edits (email/role) keyed by member id.
  const [edits, setEdits] = useState<Record<string, { email: string; role: string }>>({});
  // Which row has the set-password input open, and its value.
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [permsFor, setPermsFor] = useState<string | null>(null);
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
      setEdits({});
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
      const r = await fetch("/api/admin/team", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-8 text-[13px] text-[#8A92A6]">
        Loading the team…
      </div>
    );
  }

  const canSignIn = team.filter((m) => m.active).length;
  const onPersonal = team.filter((m) => m.hasPassword).length;
  const admins = team.filter((m) => m.isAdmin).length;

  return (
    // No width cap: eight columns squeezed into max-w-6xl wrapped every row.
    <div className="space-y-4">
      {/* How invites work. Brand-light panel rather than a bare paragraph, so it
          reads as guidance attached to the page and not as an alert. */}
      <div className="flex items-start gap-2.5 rounded-xl bg-brand-light border border-brand/15 px-4 py-3">
        <IconInfoCircle size={17} stroke={1.8} className="text-brand shrink-0 mt-[1px]" />
        <p className="text-[12.5px] leading-relaxed text-[#2138B0]">
          <span className="font-medium">Send invite</span> emails someone the dashboard link and a
          6-digit code to set their own password — the code lasts 24 hours and the password is never
          emailed. Someone with a personal password can only sign in with it; the shared team password
          stops working for them. Admin and active changes apply from their next sign-in.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[#FDECEA] border border-[#F5C6C0] px-4 py-2.5 text-[12.5px] text-[#C0392B]">{error}</div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl bg-[#E8F6F0] border border-[#CDEBDF] px-4 py-2.5 text-[12.5px] text-[#2F9E6F]">
          <IconCheck size={15} stroke={2} className="shrink-0" />{notice}
        </div>
      )}

      <Panel
        icon={<IconUsersGroup size={18} stroke={1.8} />}
        title="Who can sign in"
        meta={
          <>
            <Pill tone="mute">{canSignIn} active</Pill>
            <Pill tone="good">{onPersonal} personal {onPersonal === 1 ? "password" : "passwords"}</Pill>
            <Pill tone="brand">{admins} admin</Pill>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-left border-b border-gray-100 bg-[#FCFCFE]">
                {["Person", "Email", "Role", "Admin", "Active", "Access", "Password"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#A6ACBE] whitespace-nowrap ${
                      i === 3 || i === 4 || i === 5 ? "text-center" : ""
                    }`}
                    style={i === 1 ? { width: "24%" } : i === 2 ? { width: "20%" } : undefined}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((m) => {
                const edit = edits[m.id];
                const dirty = edit && (edit.email !== m.email || edit.role !== m.role);
                const capCount = Object.values(m.permissions || {}).filter(Boolean).length;
                const secCount = Object.values(m.sections || {}).filter(Boolean).length;
                const open = permsFor === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr className={`${open ? "bg-[#FCFCFE]" : "border-b border-gray-50"} last:border-0 ${m.active ? "" : "opacity-50"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-brand-light text-brand text-[11px] font-semibold flex items-center justify-center shrink-0">
                            {m.initials}
                          </span>
                          <span className="whitespace-nowrap">
                            <span className="block text-[13px] font-medium text-[#232D42]">{m.name}</span>
                            <span className="block text-[11px] text-[#A6ACBE]">{m.id}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          value={edit?.email ?? m.email}
                          aria-label={`${m.first}'s email`}
                          onChange={(e) => setEdits((s) => ({ ...s, [m.id]: { email: e.target.value, role: s[m.id]?.role ?? m.role } }))}
                          className={FIELD}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={edit?.role ?? m.role}
                            aria-label={`${m.first}'s role`}
                            onChange={(e) => setEdits((s) => ({ ...s, [m.id]: { role: e.target.value, email: s[m.id]?.email ?? m.email } }))}
                            className={FIELD}
                          />
                          {dirty && (
                            <button
                              disabled={busy}
                              onClick={async () => {
                                if (await call("PATCH", { id: m.id, updates: { email: edit.email.trim(), role: edit.role.trim() } })) {
                                  flash(`Saved ${m.first}'s details.`);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-[11px] font-medium hover:bg-brand-dark disabled:opacity-50 shrink-0"
                            >
                              Save
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          checked={m.isAdmin}
                          disabled={busy}
                          label={`${m.name} is an admin`}
                          onChange={async (next) => {
                            if (await call("PATCH", { id: m.id, updates: { is_admin: next } })) {
                              flash(`${m.first} is ${next ? "now an admin" : "no longer an admin"} (from their next sign-in).`);
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          checked={m.active}
                          disabled={busy}
                          label={`${m.name} can sign in`}
                          onChange={async (next) => {
                            if (await call("PATCH", { id: m.id, updates: { active: next } })) {
                              flash(next ? `${m.first} can sign in again.` : `${m.first} can no longer sign in.`);
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.isAdmin ? (
                          <Pill tone="brand">All sections</Pill>
                        ) : (
                          <button
                            onClick={() => setPermsFor(open ? null : m.id)}
                            aria-expanded={open}
                            className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                              open ? "bg-brand text-white border-brand" : "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"
                            }`}
                          >
                            {secCount} tab{secCount === 1 ? "" : "s"} · {capCount} fn{capCount === 1 ? "" : "s"}
                            <IconChevronDown size={13} stroke={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pwFor === m.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              value={pwValue}
                              onChange={(e) => setPwValue(e.target.value)}
                              placeholder="New password (8+ chars)"
                              className="w-44 px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[12.5px] font-mono text-[#232D42]"
                            />
                            <button
                              disabled={busy || pwValue.length < 8}
                              onClick={async () => {
                                if (await call("POST", { action: "set_password", id: m.id, password: pwValue })) {
                                  setPwFor(null); setPwValue("");
                                  flash(`${m.first}'s personal password is set — share it with them privately.`);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-[11px] font-medium hover:bg-brand-dark disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button onClick={() => { setPwFor(null); setPwValue(""); }} className="text-[11.5px] text-[#8A92A6] hover:text-[#232D42]">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {m.hasPassword
                              ? <Pill tone="good">Personal</Pill>
                              : <Pill tone="mute">Shared</Pill>}
                            {/* The normal way in. Emails them a one-time code so they pick
                                their own password — nothing reusable travels by email, and
                                nobody here ever knows what they chose. Setting a password by
                                hand still works, for someone with no email or no patience. */}
                            <button
                              disabled={busy || !m.email}
                              title={m.email ? `Email ${m.name} a code to set their own password` : "Add an email address first"}
                              onClick={async () => {
                                if (await call("POST", { action: "invite", id: m.id })) {
                                  flash(`Invite emailed to ${m.first} — they'll set their own password.`);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline whitespace-nowrap disabled:text-[#C9CDD8] disabled:no-underline disabled:cursor-not-allowed"
                            >
                              <IconMail size={14} stroke={1.8} />
                              {m.hasPassword ? "Re-send" : "Invite"}
                            </button>
                            <button
                              onClick={() => { setPwFor(m.id); setPwValue(""); }}
                              className="inline-flex items-center gap-1 text-[11.5px] text-[#8A92A6] hover:text-[#232D42] whitespace-nowrap"
                            >
                              <IconKey size={14} stroke={1.8} />
                              {m.hasPassword ? "Change" : "Set"}
                            </button>
                            {m.hasPassword && (
                              <button
                                disabled={busy}
                                title={`Put ${m.first} back on the shared team password`}
                                onClick={async () => {
                                  if (await call("POST", { action: "clear_password", id: m.id })) {
                                    flash(`${m.first} is back on the shared password.`);
                                  }
                                }}
                                className="text-[11.5px] text-[#A6ACBE] hover:text-[#C0392B] whitespace-nowrap"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && !m.isAdmin && (
                      <tr className="border-b border-gray-50 last:border-0 bg-[#FCFCFE]">
                        <td colSpan={7} className="px-4 pb-4 pt-0">
                          <PermPanel m={m} busy={busy}
                            onSet={async (perms) => { if (await call("PATCH", { id: m.id, updates: { permissions: perms } })) flash(`Updated ${m.first}'s functions.`); }}
                            onSetSections={async (secs) => { if (await call("PATCH", { id: m.id, updates: { sections: secs } })) flash(`Updated ${m.first}'s tab access.`); }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={<IconUserPlus size={18} stroke={1.8} />} title="Add a team member">
        <div className="p-5">
          {showAdd ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                {([
                  ["name", "Full name", "Asha Nair"],
                  ["email", "Work email", "asha@goocampus.in"],
                  ["id", "Short id", "asha (lowercase, no spaces)"],
                  ["role", "Role", "Content Writer"],
                ] as const).map(([key, label, ph]) => (
                  <label key={key} className="block">
                    <span className="block text-[11px] font-medium text-[#8A92A6] mb-1">{label}</span>
                    <input
                      value={add[key]}
                      onChange={(e) => setAdd((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder={ph}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[13px] text-[#232D42] placeholder:text-[#C9CDD8]"
                    />
                  </label>
                ))}
              </div>
              <p className="text-[11.5px] text-[#8A92A6]">
                They sign in with the shared team password until you invite them or set a personal one.
              </p>
              <div className="flex items-center gap-3">
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await call("POST", { action: "add", ...add })) {
                      setAdd({ id: "", name: "", email: "", role: "" });
                      setShowAdd(false);
                      flash("Added — they sign in with their email + the shared password until you set a personal one.");
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50"
                >
                  Add member
                </button>
                <button onClick={() => setShowAdd(false)} className="text-[13px] text-[#8A92A6] hover:text-[#232D42]">Cancel</button>
              </div>
            </div>
          ) : (
            // The panel header already says what this is, so the closed state
            // explains the consequence instead of repeating the title.
            <div className="flex items-center gap-4 flex-wrap">
              <p className="text-[12.5px] text-[#8A92A6]">
                They can sign in as soon as you add them, using the shared team password.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-[13px] font-medium text-[#4A5468] hover:border-brand hover:text-brand"
              >
                <IconUserPlus size={16} stroke={1.8} /> New member
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ── per-person access editor ──────────────────────────────────────────────── */

// Tab access (which pages they open) + function toggles.
function PermPanel({ m, busy, onSet, onSetSections }: { m: Member; busy: boolean; onSet: (perms: Record<string, boolean>) => void; onSetSections: (secs: Record<string, boolean>) => void }) {
  const perms = m.permissions || {};
  const secs = m.sections || {};
  const setCap = (cap: Capability, on: boolean) => { const next = { ...perms }; if (on) next[cap] = true; else delete next[cap]; onSet(next); };
  const applyPreset = (caps: Capability[]) => { const next: Record<string, boolean> = {}; caps.forEach((c) => { next[c] = true; }); onSet(next); };
  const setSec = (sec: Section, on: boolean) => { const next = { ...secs }; if (on) next[sec] = true; else delete next[sec]; onSetSections(next); };
  const applyRole = (list: Section[]) => { const next: Record<string, boolean> = {}; list.forEach((s) => { next[s] = true; }); onSetSections(next); };

  const preset = (label: string, onClick: () => void) => (
    <button key={label} disabled={busy} onClick={onClick}
      className="text-[11.5px] font-medium bg-white text-[#4A5468] border border-gray-200 px-2.5 py-1 rounded-lg hover:border-brand hover:text-brand disabled:opacity-50">
      {label}
    </button>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100">
      {/* Which sections of the dashboard they can open. Each card now names the
          tabs it unlocks — that mapping used to hide in a title tooltip, so
          granting "Sales" gave no hint it meant lead names and phone numbers. */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <IconLayoutGrid size={15} stroke={1.8} className="text-[#8A92A6]" />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8A92A6] mr-1">Tab access — which pages they see</span>
          {ROLE_PRESETS.map((r) => preset(r.label, () => applyRole(r.sections)))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {GRANTABLE_SECTIONS.map((s) => {
            const on = secs[s.key] === true;
            return (
              <label key={s.key}
                className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer border transition-colors ${
                  on ? "border-brand/40 bg-brand-light/40" : "border-gray-100 bg-[#FCFCFE] hover:border-gray-200"
                }`}>
                <input type="checkbox" checked={on} disabled={busy}
                  onChange={(e) => setSec(s.key, e.target.checked)}
                  className="mt-[2px] w-[15px] h-[15px] accent-[#3A57E8] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-[#232D42]">{s.label}</span>
                  <span className="block text-[10.5px] leading-snug text-[#8A92A6]">{s.tabs}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* What they can do inside those pages. */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <IconAdjustmentsHorizontal size={15} stroke={1.8} className="text-[#8A92A6]" />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8A92A6] mr-1">Functions — what they can do</span>
          {PRESETS.map((p) => preset(p.label, () => applyPreset(p.caps)))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CAPABILITIES.map((c) => {
            const on = perms[c.key] === true;
            return (
              <label key={c.key}
                className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer border transition-colors ${
                  on ? "border-brand/40 bg-brand-light/40" : "border-gray-100 bg-[#FCFCFE] hover:border-gray-200"
                }`}>
                <input type="checkbox" checked={on} disabled={busy}
                  onChange={(e) => setCap(c.key, e.target.checked)}
                  className="mt-[2px] w-[15px] h-[15px] accent-[#3A57E8] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-[#232D42]">{c.label}</span>
                  <span className="block text-[10.5px] leading-snug text-[#8A92A6]">{c.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <p className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] text-[#A6ACBE]">
        <IconShieldLock size={13} stroke={1.8} className="shrink-0" />
        System tabs (Integrations, Diagnostics, Tools, Team) are admin-only and can&apos;t be granted here.
      </p>
    </div>
  );
}
