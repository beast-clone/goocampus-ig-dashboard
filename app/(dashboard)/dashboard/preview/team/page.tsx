"use client";
import { Fragment, useEffect, useState } from "react";
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

  if (team === null) return <p className="text-sm text-gray-500">Loading the team…</p>;

  return (
    // No width cap (was max-w-6xl): eight columns squeezed into that width made
    // every row wrap onto two lines. It runs to the edge of the dashboard now.
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-light border border-brand/20 px-4 py-3 text-sm text-brand">
        <span className="font-medium">Send invite</span> emails someone the dashboard link and a
        6-digit code to set their own password — the code lasts 24 hours and the password is never
        emailed. Someone with a personal password can only sign in with it; the shared team password
        stops working for them. Admin and active changes apply from their next sign-in.
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Person</th>
              <th className="px-4 py-3 font-medium" style={{ width: "26%" }}>Email</th>
              <th className="px-4 py-3 font-medium" style={{ width: "22%" }}>Role</th>
              <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Admin</th>
              <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Active</th>
              <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Access</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Password</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const edit = edits[m.id];
              const dirty = edit && (edit.email !== m.email || edit.role !== m.role);
              const capCount = Object.values(m.permissions || {}).filter(Boolean).length;
              const secCount = Object.values(m.sections || {}).filter(Boolean).length;
              return (
                <Fragment key={m.id}>
                <tr className={`${permsFor === m.id ? "" : "border-b border-gray-50"} last:border-0 ${m.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-light text-brand text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.initials}
                      </div>
                      <div className="whitespace-nowrap">
                        <div className="font-medium text-gray-900">{m.name}</div>
                        <div className="text-xs text-gray-400">{m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={edit?.email ?? m.email}
                      onChange={(e) => setEdits((s) => ({ ...s, [m.id]: { email: e.target.value, role: s[m.id]?.role ?? m.role } }))}
                      className="w-full min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={edit?.role ?? m.role}
                        onChange={(e) => setEdits((s) => ({ ...s, [m.id]: { role: e.target.value, email: s[m.id]?.email ?? m.email } }))}
                        className="w-full min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                      />
                      {dirty && (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            if (await call("PATCH", { id: m.id, updates: { email: edit.email.trim(), role: edit.role.trim() } })) {
                              flash(`Saved ${m.first}'s details.`);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark disabled:opacity-50"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.isAdmin}
                      disabled={busy}
                      onChange={async (e) => {
                        if (await call("PATCH", { id: m.id, updates: { is_admin: e.target.checked } })) {
                          flash(`${m.first} is ${e.target.checked ? "now an admin" : "no longer an admin"} (from their next sign-in).`);
                        }
                      }}
                      className="w-4 h-4 accent-[#3A57E8]"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.active}
                      disabled={busy}
                      onChange={async (e) => {
                        if (await call("PATCH", { id: m.id, updates: { active: e.target.checked } })) {
                          flash(e.target.checked ? `${m.first} can sign in again.` : `${m.first} can no longer sign in.`);
                        }
                      }}
                      className="w-4 h-4 accent-[#3A57E8]"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.isAdmin ? (
                      <span className="text-[11px] font-medium text-brand bg-brand-light px-2.5 py-1 rounded-full whitespace-nowrap">All (admin)</span>
                    ) : (
                      <button onClick={() => setPermsFor(permsFor === m.id ? null : m.id)} className="text-xs font-medium text-brand hover:underline inline-flex items-center gap-1 whitespace-nowrap">
                        {secCount} tab{secCount === 1 ? "" : "s"} · {capCount} fn{capCount === 1 ? "" : "s"} <span className="text-gray-400">{permsFor === m.id ? "▲" : "▾"}</span>
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
                          className="w-44 px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm font-mono"
                        />
                        <button
                          disabled={busy || pwValue.length < 8}
                          onClick={async () => {
                            if (await call("POST", { action: "set_password", id: m.id, password: pwValue })) {
                              setPwFor(null); setPwValue("");
                              flash(`${m.first}'s personal password is set — share it with them privately.`);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setPwFor(null); setPwValue(""); }}
                          className="text-xs text-gray-500 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {m.hasPassword ? (
                          <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2.5 py-1 whitespace-nowrap">Personal ✓</span>
                        ) : (
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 whitespace-nowrap">Shared</span>
                        )}
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
                          className="text-xs font-medium text-brand hover:underline whitespace-nowrap disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {m.hasPassword ? "Re-send invite" : "Send invite"}
                        </button>
                        <button
                          onClick={() => { setPwFor(m.id); setPwValue(""); }}
                          className="text-xs text-gray-400 hover:text-gray-900 whitespace-nowrap"
                        >
                          {m.hasPassword ? "Change password" : "Set password"}
                        </button>
                        {m.hasPassword && (
                          <button
                            disabled={busy}
                            onClick={async () => {
                              if (await call("POST", { action: "clear_password", id: m.id })) {
                                flash(`${m.first} is back on the shared password.`);
                              }
                            }}
                            className="text-xs text-gray-400 hover:text-red-600 whitespace-nowrap"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {permsFor === m.id && !m.isAdmin && (
                  <tr className="border-b border-gray-50 last:border-0">
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

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        {showAdd ? (
          <div className="space-y-3">
            <div className="text-base font-medium text-[#232D42]">Add a team member</div>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <input
                value={add.name}
                onChange={(e) => setAdd((s) => ({ ...s, name: e.target.value }))}
                placeholder="Full name"
                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
              <input
                value={add.email}
                onChange={(e) => setAdd((s) => ({ ...s, email: e.target.value }))}
                placeholder="work@goocampus.in"
                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
              <input
                value={add.id}
                onChange={(e) => setAdd((s) => ({ ...s, id: e.target.value }))}
                placeholder="Short id, e.g. asha (lowercase)"
                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
              <input
                value={add.role}
                onChange={(e) => setAdd((s) => ({ ...s, role: e.target.value }))}
                placeholder="Role, e.g. Content Writer"
                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
            </div>
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
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
              >
                Add member
              </button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="text-sm font-medium text-brand hover:underline">
            + Add a team member
          </button>
        )}
      </div>
    </div>
  );
}

// Per-person access editor — tab access (which pages they open) + function toggles.
function PermPanel({ m, busy, onSet, onSetSections }: { m: Member; busy: boolean; onSet: (perms: Record<string, boolean>) => void; onSetSections: (secs: Record<string, boolean>) => void }) {
  const perms = m.permissions || {};
  const secs = m.sections || {};
  const setCap = (cap: Capability, on: boolean) => { const next = { ...perms }; if (on) next[cap] = true; else delete next[cap]; onSet(next); };
  const applyPreset = (caps: Capability[]) => { const next: Record<string, boolean> = {}; caps.forEach((c) => { next[c] = true; }); onSet(next); };
  const setSec = (sec: Section, on: boolean) => { const next = { ...secs }; if (on) next[sec] = true; else delete next[sec]; onSetSections(next); };
  const applyRole = (list: Section[]) => { const next: Record<string, boolean> = {}; list.forEach((s) => { next[s] = true; }); onSetSections(next); };
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
      {/* Tab access — which sections of the dashboard they can open */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mr-1">Tab access — which pages they see</span>
          {ROLE_PRESETS.map((r) => (
            <button key={r.key} disabled={busy} onClick={() => applyRole(r.sections)} className="text-xs font-medium bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-brand/40 hover:text-brand disabled:opacity-50">{r.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {GRANTABLE_SECTIONS.map((s) => (
            <label key={s.key} title={s.tabs} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 cursor-pointer hover:border-brand/30">
              <input type="checkbox" checked={secs[s.key] === true} disabled={busy} onChange={(e) => setSec(s.key, e.target.checked)} className="w-4 h-4 accent-[#3A57E8] shrink-0" />
              <span className="text-xs font-medium text-[#232D42] truncate">{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Functions — what they can do inside those pages */}
      <div className="border-t border-gray-200/70 pt-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mr-1">Functions — what they can do</span>
          {PRESETS.map((p) => (
            <button key={p.key} disabled={busy} onClick={() => applyPreset(p.caps)} className="text-xs font-medium bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-brand/40 hover:text-brand disabled:opacity-50">{p.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CAPABILITIES.map((c) => (
            <label key={c.key} className="flex items-start gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 cursor-pointer hover:border-brand/30">
              <input type="checkbox" checked={perms[c.key] === true} disabled={busy} onChange={(e) => setCap(c.key, e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#3A57E8]" />
              <span className="min-w-0"><span className="block text-xs font-medium text-[#232D42]">{c.label}</span><span className="block text-[10.5px] text-gray-400 leading-snug">{c.desc}</span></span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
