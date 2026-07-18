"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";

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
};

export default function TeamPage() {
  return (
    <HopeDashboardShell active="team" title="Team" subtitle="Who can sign in, what they can open, and their passwords." hideAccountPicker>
      {() => <TeamManager />}
    </HopeDashboardShell>
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
    <div className="max-w-6xl space-y-4">
      <div className="rounded-xl bg-brand-light border border-brand/20 px-4 py-3 text-sm text-brand">
        Admin and active changes apply the next time that person signs in. Someone with a
        <span className="font-medium"> personal password</span> can only sign in with it — the shared
        team password stops working for them. People without one keep using the shared password.
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-center">Admin</th>
              <th className="px-4 py-3 font-medium text-center">Active</th>
              <th className="px-4 py-3 font-medium">Password</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const edit = edits[m.id];
              const dirty = edit && (edit.email !== m.email || edit.role !== m.role);
              return (
                <tr key={m.id} className={`border-b border-gray-50 last:border-0 ${m.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-light text-brand text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.initials}
                      </div>
                      <div>
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
                          <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2.5 py-1">Personal ✓</span>
                        ) : (
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">Shared</span>
                        )}
                        <button
                          onClick={() => { setPwFor(m.id); setPwValue(""); }}
                          className="text-xs text-brand hover:underline"
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
                            className="text-xs text-gray-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
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
