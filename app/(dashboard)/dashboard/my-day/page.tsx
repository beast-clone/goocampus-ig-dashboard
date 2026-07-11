"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewTaskButton } from "@/components/NewTaskModal";
import { useApi } from "@/lib/use-api";

// Manya's / Praveen's / Nikhil's / Nandu's individual dashboard.
//
// Layout:
//   Header · Week strip · + Add task
//   Two columns: task list (left) + detail panel (right, opens on click)
//
// Detail panel has view mode and edit mode. Edit persists via
// PATCH /api/marketing-hub/update.

type Row = {
  id: string;
  particulars: string;
  type: string;
  status: string;
  sbu: string;
  owner: string;
  collaborators: string[];
  platforms: string[];
  publishTo: string;
  publishToPage: string;
  priority: string;
  publishingDate: string;
  dueDate: string;
  completionTime: string;
  createdDate: string;
  lastModified: string;
  needsReview: boolean;
  syncedToScheduler: boolean;
  caption: string;
  content: string;
  additionalInfo: string;
  outputLink: string;
  instagramUrl: string;
  facebookUrl: string;
  link: string;
  slackLink: string;
  attachments: { url: string; filename: string; type?: string }[];
};

type Data = { rows: Row[]; generatedAt: string; latencyMs: number; cached?: boolean };

type Role = "writer" | "designer" | "editor";
type Person = { key: string; label: string; role: Role; aliases: string[]; color: string; greeting: string };

const TEAM: Person[] = [
  { key: "manya",   label: "Manya",   role: "writer",   aliases: ["Manya B M", "Manya"],                              color: "#D4537E", greeting: "Let's write something great" },
  { key: "praveen", label: "Praveen", role: "designer", aliases: ["Praveen L", "Praveen"],                            color: "#378ADD", greeting: "Ready to design" },
  { key: "nikhil",  label: "Nikhil",  role: "editor",   aliases: ["NIKHI Shyamraj", "Nikhil Shyamraj", "Nikhil"],     color: "#EF9F27", greeting: "Time to cut some reels" },
  { key: "nandu",   label: "Nandu",   role: "editor",   aliases: ["Nandu C", "Nandu"],                                color: "#5DCAA5", greeting: "Time to cut some reels" },
];

const ROLE_LABEL: Record<Role, string> = { writer: "Content writer", designer: "Graphic designer", editor: "Video editor" };
const DONE_STATUSES = ["Ready to Publish", "Published/Scheduled"];
const LS_KEY = "gc-dash:my-day:person";

// The status pill color palette — matches Airtable style.
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "Content - Pending":     { bg: "#F1EFE8", text: "#444441" },
  "Content - In Progress": { bg: "#FAEEDA", text: "#633806" },
  "Content - Approved":    { bg: "#EAF3DE", text: "#27500A" },
  "Incorporating Feedback":{ bg: "#FAEEDA", text: "#633806" },
  "Output - Ready":        { bg: "#E6F1FB", text: "#0C447C" },
  "Ready to Publish":      { bg: "#EAF3DE", text: "#27500A" },
  "Published/Scheduled":   { bg: "#E1F5EE", text: "#0F6E56" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  Low:    { bg: "#F1EFE8", text: "#444441" },
  Medium: { bg: "#E6F1FB", text: "#0C447C" },
  High:   { bg: "#FAEEDA", text: "#633806" },
  Urgent: { bg: "#FCEBEB", text: "#A32D2D" },
};

// Statuses shown in the Edit form's status dropdown.
const STATUS_OPTIONS = [
  "Content - Pending",
  "Content - In Progress",
  "Content - Approved",
  "Incorporating Feedback",
  "Output - Ready",
  "Ready to Publish",
  "Published/Scheduled",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ownerMatches(owner: string, p: Person): boolean {
  if (!owner) return false;
  return p.aliases.some((a) => owner.toLowerCase() === a.toLowerCase());
}

function greetingOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function MyDayPage() {
  return (
    <DashboardShell title="My Day" subtitle="Your queue for today — pick the person, see what's next.">
      {({ range }) => <Inner range={range} />}
    </DashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  // Widen the fetch to cover the week ahead + a bit of context.
  const wideTo = new Date(Math.max(new Date(range.to).getTime(), Date.now() + 21 * 86_400_000)).toISOString().slice(0, 10);
  const wideFrom = new Date(Math.min(new Date(range.from).getTime(), Date.now() - 30 * 86_400_000)).toISOString().slice(0, 10);
  const qs = new URLSearchParams({ from: wideFrom, to: wideTo }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);

  const [personKey, setPersonKey] = useState<string>("manya");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_KEY);
      if (saved && TEAM.some((p) => p.key === saved)) setPersonKey(saved);
    } catch { /* ignore */ }
  }, []);
  const setPerson = (k: string) => {
    setPersonKey(k);
    setSelectedId(null);
    try { window.localStorage.setItem(LS_KEY, k); } catch { /* ignore */ }
  };

  const person = TEAM.find((p) => p.key === personKey) || TEAM[0];
  const todayStr = ymd(new Date());

  const mine = useMemo(() => {
    const rows = data?.rows || [];
    // Designers and editors only get the pipeline once the writer approves.
    // Writers see their whole pipeline from Content Pending onwards.
    const preContentStatuses = new Set(["Content - Pending", "Content - In Progress", "Incorporating Feedback"]);
    const isPostWriterRole = person.role === "designer" || person.role === "editor";
    const isStatic = (t: string) => /post|carousel|thumbnail|youtube.*(post|thumbnail)/i.test(t || "");
    const isVideo = (t: string) => /reel|video|long.*form/i.test(t || "");

    return rows.filter((r) => {
      if (isPostWriterRole && preContentStatuses.has(r.status)) return false;

      if (ownerMatches(r.owner, person)) return true;

      // Designer/editor also sees eligible-to-claim tasks so they can grab them from a task list
      if (person.key === "praveen" && isStatic(r.type)) return true;
      if ((person.key === "nikhil" || person.key === "nandu") && isVideo(r.type)) return true;

      return false;
    });
  }, [data, person]);

  // Bucket for header status line
  const counts = useMemo(() => {
    const today: Row[] = [];
    const week: Row[] = [];
    const waiting: Row[] = [];
    const done: Row[] = [];
    const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));
    const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
    for (const r of mine) {
      const pd = r.publishingDate?.slice(0, 10) || "";
      const isDone = DONE_STATUSES.includes(r.status);
      if (isDone && r.completionTime?.slice(0, 10) >= weekAgo) done.push(r);
      if (isDone) continue;
      if (pd === todayStr) today.push(r);
      if (pd && pd >= todayStr && pd <= weekAhead) week.push(r);
      if (r.needsReview) waiting.push(r);
    }
    return { today, week, waiting, done };
  }, [mine, todayStr]);

  // Personal notepad — reminders manually added by the person.
  const [notes, setNotes] = useState<{ id: string; body: string; done: boolean }[]>([]);
  const [newNote, setNewNote] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketing-hub/notes?person=${personKey}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.notes) setNotes(j.notes); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [personKey]);

  async function addNote() {
    const body = newNote.trim();
    if (!body || notesBusy) return;
    setNotesBusy(true);
    try {
      const r = await fetch(`/api/marketing-hub/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person: personKey, body }),
      });
      const j = await r.json();
      if (r.ok && j.note) {
        setNotes((prev) => [...prev, j.note]);
        setNewNote("");
      }
    } finally { setNotesBusy(false); }
  }

  async function toggleNote(id: string, done: boolean) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, done } : n)));
    await fetch(`/api/marketing-hub/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done }),
    });
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/marketing-hub/notes?id=${id}`, { method: "DELETE" });
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? mine.find((r) => r.id === selectedId) || null : null;

  return (
    <div className="space-y-5">
      {/* Person switcher */}
      <div className="bg-white border border-gray-100 rounded-lg p-2 flex items-center gap-2">
        <div className="text-sm text-gray-500 px-3">Viewing as</div>
        {TEAM.map((p) => (
          <button
            key={p.key}
            onClick={() => setPerson(p.key)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${personKey === p.key ? "text-white" : "text-gray-700 hover:bg-gray-50"}`}
            style={personKey === p.key ? { background: p.color } : {}}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto">
          <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {/* Greeting */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-medium" style={{ background: person.color + "22", color: person.color }}>
          {person.label.slice(0, 1)}
        </div>
        <div className="flex-1">
          <div className="text-2xl font-medium">{greetingOfDay()}, {person.label}</div>
          <div className="text-sm text-gray-500">
            {ROLE_LABEL[person.role]} · {person.greeting}
            {mine.length > 0 && ` · ${counts.today.length} today, ${counts.week.length} this week`}
          </div>
        </div>
      </div>

      {/* Stat cards — writer sees the full pipeline, designer/editor see only their downstream work */}
      {(() => {
        const isWriter = person.role === "writer";
        const pendingToday    = mine.filter((r) => (r.publishingDate?.slice(0, 10) || "") === todayStr && !DONE_STATUSES.includes(r.status)).length;
        const contentPending  = mine.filter((r) => r.status === "Content - Pending").length;
        const inProgress      = mine.filter((r) => r.status === "Content - In Progress").length;
        const feedback        = mine.filter((r) => r.status === "Incorporating Feedback").length;
        const contentApproved = mine.filter((r) => r.status === "Content - Approved").length;
        const outputReady     = mine.filter((r) => r.status === "Output - Ready").length;
        const readyToPublish  = mine.filter((r) => r.status === "Ready to Publish").length;
        const handedOff       = mine.filter((r) => ["Content - Approved", "Output - Ready", "Ready to Publish", "Published/Scheduled"].includes(r.status)).length;
        const completed       = counts.done.length;

        const cards = isWriter ? [
          { label: "Pending today",       value: pendingToday,    hint: "Publish date is today",       color: "#D4537E" },
          { label: "Content pending",     value: contentPending,  hint: "Awaiting your write-up",      color: "#B08308" },
          { label: "In progress",         value: inProgress,      hint: "Writing right now",           color: "#EF9F27" },
          { label: "Feedback to address", value: feedback,        hint: "Revisions requested",         color: "#A32D2D" },
          { label: "Content approved",    value: contentApproved, hint: "Approved, ready for output",  color: "#27500A" },
          { label: "Handed off",          value: handedOff,       hint: "Past writer, with the team",  color: "#0C447C" },
          { label: "Completed",           value: completed,       hint: "Wrapped up this week",        color: "#0F6E56" },
        ] : [
          { label: "Pending today",       value: pendingToday,    hint: "Publish date is today",             color: "#D4537E" },
          { label: "Waiting on me",       value: contentApproved, hint: "Content approved · start making",   color: "#EF9F27" },
          { label: "Output ready",        value: outputReady,     hint: "You've uploaded the creative",      color: "#0C447C" },
          { label: "Ready to publish",    value: readyToPublish,  hint: "Queued for the scheduler",          color: "#27500A" },
          { label: "Completed",           value: completed,       hint: "Wrapped up this week",              color: "#0F6E56" },
        ];
        const cols = cards.length === 7 ? "grid-cols-7" : "grid-cols-5";
        return (
          <div className={`grid ${cols} gap-3`}>
            {cards.map((c) => (
              <div key={c.label} className="bg-white border border-gray-100 rounded-lg p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 leading-tight">{c.label}</div>
                <div className="mt-1 text-2xl font-medium tabular-nums" style={{ color: c.color }}>{c.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{c.hint}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Notes — personal reminders, manually added */}
      <div
        className="rounded-lg p-5 border-l-4"
        style={{ background: "#FFFBEA", borderColor: "#EF9F27", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-lg font-medium flex items-center gap-2">📌 My reminders</div>
            <div className="text-sm text-gray-600">Everything you need to work on. Add anything, check off when done.</div>
          </div>
          <div className="text-sm text-gray-500">
            {notes.filter((n) => !n.done).length} open · {notes.filter((n) => n.done).length} done
          </div>
        </div>

        <div className="grid grid-rows-4 grid-flow-col auto-cols-fr gap-x-6 gap-y-1 mb-3">
          {notes.length === 0 && (
            <div className="text-sm text-gray-400 py-3 col-span-full">Nothing here yet. Add your first note below.</div>
          )}
          {notes.map((n) => (
            <div key={n.id} className="group flex items-start gap-3 px-2 py-1.5 rounded hover:bg-white/60">
              <input
                type="checkbox"
                checked={n.done}
                onChange={(e) => toggleNote(n.id, e.target.checked)}
                className="mt-1 h-4 w-4 rounded cursor-pointer flex-shrink-0"
                style={{ accentColor: person.color }}
              />
              <span className={`flex-1 text-sm ${n.done ? "line-through text-gray-400" : "text-gray-800"}`}>
                {n.body}
              </span>
              <button
                onClick={() => deleteNote(n.id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-rose-600 transition flex-shrink-0"
                title="Delete note"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-amber-200/50">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
            placeholder="Add a reminder…"
            className="flex-1 border border-amber-200 rounded px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button
            onClick={addNote}
            disabled={notesBusy || !newNote.trim()}
            className="px-4 py-2 rounded text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            style={{ background: person.color }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Two-column body: compact list on left · portrait detail on right */}
      <div className="grid grid-cols-5 gap-4">
        {/* Task list — 2 cols, compact rows */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-lg p-4 self-start">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-base font-medium">My tasks</div>
            <div className="text-xs text-gray-500">{mine.length}</div>
          </div>

          {mine.length === 0 && (
            <div className="text-sm text-gray-400 py-10 text-center">
              {isLoading ? "Loading…" : "Nothing on your plate right now."}
            </div>
          )}

          <div className="space-y-1.5">
            {mine.map((r) => {
              const isSelected = selectedId === r.id;
              const st = STATUS_STYLES[r.status] || STATUS_STYLES["Content - Pending"];
              const isOwner = ownerMatches(r.owner, person);
              const isEligibleToClaim = !isOwner && (person.role === "designer" || person.role === "editor") &&
                ["Content - Approved", "Output - Ready"].includes(r.status);
              return (
                <div key={r.id} className="relative">
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left rounded-lg p-2.5 border transition ${isSelected ? "" : "border-gray-100 hover:border-gray-200"}`}
                    style={isSelected ? { borderLeft: `3px solid ${person.color}`, background: person.color + "0A", borderColor: person.color + "33" } : {}}
                  >
                    <div className="text-sm font-medium leading-tight pr-16">{r.particulars || "(untitled)"}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {r.type || "—"}
                      {r.publishingDate && ` · ${new Date(r.publishingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                      {!isOwner && r.owner && <span className="text-gray-400"> · owned by {r.owner.split(" ")[0]}</span>}
                    </div>
                    <div className="mt-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{r.status || "—"}</span>
                      {r.needsReview && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ml-1">Review</span>}
                    </div>
                  </button>
                  {isEligibleToClaim && (
                    <ClaimRowButton postId={r.id} personKey={person.key} onDone={refresh} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel — 3 cols, portrait, sticky */}
        <div className="col-span-3">
          {selected ? (
            <div>
              <DetailPanel
                row={selected}
                accent={person.color}
                personKey={person.key}
                onClose={() => setSelectedId(null)}
                onSaved={() => { refresh(); }}
              />
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-sm text-gray-400">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-base font-medium text-gray-700 mb-2">Pick a task from the left</div>
              <div>Full details, timeline, and edit mode will open here.</div>
            </div>
          )}
        </div>
      </div>

      <NewTaskButton onCreated={refresh} />
    </div>
  );
}

// Rank the workflow statuses so we can render a horizontal progress bar.
// Incorporating Feedback loops back to Approved for display purposes.
const STATUS_RANK: Record<string, number> = {
  "Content - Pending":     0,
  "Content - In Progress": 1,
  "Content - Approved":    2,
  "Incorporating Feedback":2,
  "Output - Ready":        3,
  "Ready to Publish":      4,
  "Published/Scheduled":   5,
};

// The 5 stages shown on the horizontal timeline strip.
const TIMELINE_STAGES = [
  { rank: 0, label: "Draft" },
  { rank: 1, label: "In progress" },
  { rank: 2, label: "Approved" },
  { rank: 3, label: "Output ready" },
  { rank: 5, label: "Published" },
];

type Collaborator = { key: string; name: string; role: string | null; addedAt: string | null };
type Attachment = { id: string; filename: string; storage_path: string; mime_type: string | null; size_bytes: number | null; uploaded_by: string | null; uploaded_at: string };
type Comment = { id: string; author_key: string; authorName: string; body: string; resolved: boolean; created_at: string };
type Activity = { id: string; actor_key: string; actorName: string; action: string; from_value: string | null; to_value: string | null; detail: string | null; created_at: string };
type TaskDetail = {
  collaborators: Collaborator[];
  attachments: Attachment[];
  comments: Comment[];
  activity: Activity[];
  scheduler: { syncedToScheduler: boolean; startAt: string | null };
};

function DetailPanel({ row, accent, onClose, onSaved, personKey }: { row: Row; accent: string; onClose: () => void; onSaved: () => void; personKey: string }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailReloadTick, setDetailReloadTick] = useState(0);

  useEffect(() => { setMode("view"); }, [row.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketing-hub/task-detail?id=${row.id}`)
      .then((r) => r.json())
      .then((j: TaskDetail) => { if (!cancelled) setDetail(j); })
      .catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
  }, [row.id, detailReloadTick]);

  const currentRank = STATUS_RANK[row.status] ?? 0;
  const refreshDetail = () => setDetailReloadTick((n) => n + 1);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6" style={{ borderLeft: `4px solid ${accent}` }}>
      {mode === "view" ? (
        <ViewMode
          row={row}
          accent={accent}
          currentRank={currentRank}
          detail={detail}
          personKey={personKey}
          onClose={onClose}
          onEdit={() => setMode("edit")}
          onSaved={onSaved}
          onDetailChanged={refreshDetail}
        />
      ) : (
        <EditForm
          row={row}
          accent={accent}
          currentRank={currentRank}
          onClose={onClose}
          onCancel={() => setMode("view")}
          onSaved={() => { onSaved(); setMode("view"); }}
        />
      )}
    </div>
  );
}

function ViewMode({ row, accent, currentRank, detail, personKey, onClose, onEdit, onSaved, onDetailChanged }: {
  row: Row; accent: string; currentRank: number;
  detail: TaskDetail | null; personKey: string;
  onClose: () => void; onEdit: () => void; onSaved: () => void; onDetailChanged: () => void;
}) {
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const st = STATUS_STYLES[row.status] || STATUS_STYLES["Content - Pending"];

  async function markDone() {
    // "Mark done" pushes to the next natural step:
    //   Content Pending → Content Approved (writer approves)
    //   Content Approved → Output Ready
    //   Output Ready → Ready to Publish
    //   Ready to Publish → Published/Scheduled
    const nextByStatus: Record<string, string> = {
      "Content - Pending":     "Content - Approved",
      "Content - In Progress": "Content - Approved",
      "Content - Approved":    "Output - Ready",
      "Incorporating Feedback":"Output - Ready",
      "Output - Ready":        "Ready to Publish",
      "Ready to Publish":      "Published/Scheduled",
    };
    const next = nextByStatus[row.status];
    if (!next) return;
    setBusyStatus(next);
    try {
      const r = await fetch(`/api/marketing-hub/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, fields: { status: next } }),
      });
      const j = await r.json();
      if (!r.ok || j.error) alert(`Failed: ${j.error || r.status}`);
      else onSaved();
    } finally {
      setBusyStatus(null);
    }
  }

  const publishLabel = row.publishingDate
    ? new Date(row.publishingDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: accent }}>Task detail</div>
          <div className="text-xl font-medium mt-1 leading-tight">{row.particulars || "(untitled)"}</div>
          <div className="text-xs text-gray-500 mt-1">
            {[row.type, row.sbu, publishLabel && `Publishes ${publishLabel}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
      </div>

      {/* Collaborators strip */}
      {detail && (
        <TeamStrip
          postId={row.id}
          type={row.type}
          ownerName={row.owner}
          viewerKey={personKey}
          collaborators={detail.collaborators}
          onChanged={onDetailChanged}
        />
      )}

      {/* Feedback notes — prominent when status is Incorporating Feedback, otherwise plain */}
      {row.additionalInfo && (
        <div
          className={`mb-4 rounded-lg p-3 border ${row.status === "Incorporating Feedback" ? "" : "border-gray-100 bg-gray-50/60"}`}
          style={row.status === "Incorporating Feedback" ? { borderColor: "#F0C24A", background: "#FFF9E9" } : {}}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              {row.status === "Incorporating Feedback" ? "🔁 Feedback to address" : "Feedback / notes"}
            </span>
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{row.additionalInfo}</div>
        </div>
      )}

      {/* Meta strip — all fields in one horizontal line */}
      <div className="border-t border-gray-100 pt-3 flex items-center flex-wrap gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Status</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{row.status}</span>
        </span>
        {row.priority && (
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide text-[10px]">Priority</span>
            <span className="text-gray-800">{row.priority}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Owner</span>
          <span className="text-gray-800">{row.owner || "—"}</span>
        </span>
        {row.platforms.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide text-[10px]">Platform</span>
            <span className="text-gray-800">{row.platforms.join(" · ")}</span>
          </span>
        )}
        {row.publishingDate && (
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide text-[10px]">Publish</span>
            <span className="text-gray-800">{new Date(row.publishingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </span>
        )}
        {row.dueDate && (
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide text-[10px]">Due</span>
            <span className="text-gray-800">{new Date(row.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </span>
        )}
        {row.sbu && (
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide text-[10px]">SBU</span>
            <span className="text-gray-800">{row.sbu}</span>
          </span>
        )}
      </div>

      {/* Content brief — expands naturally, full text visible */}
      {row.content && (
        <div className="border-t border-gray-100 mt-4 pt-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">Content brief</div>
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {row.content}
          </div>
        </div>
      )}

      {/* Caption draft — expands naturally too */}
      {row.caption && (
        <div className="border-t border-gray-100 mt-4 pt-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">Caption draft</div>
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{row.caption}</div>
        </div>
      )}

      {/* Creative files — references, mood board, final output */}
      {detail && (
        <div className="border-t border-gray-100 mt-5 pt-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Creative files{detail.attachments.length > 0 && ` · ${detail.attachments.length}`}
            </div>
            <div className="text-[10px] text-gray-400">References, mood board, final output</div>
          </div>
          <CreativeFiles
            postId={row.id}
            personRow={row}
            attachments={detail.attachments}
            personKey={personKey}
            accent={accent}
            onChanged={onDetailChanged}
            onTaskAdvanced={() => { onDetailChanged(); onSaved(); }}
          />
        </div>
      )}

      {/* Timeline — horizontal steps */}
      <div className="border-t border-gray-100 mt-5 pt-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-3">Timeline</div>
        <HorizontalTimeline currentRank={currentRank} accent={accent} />
      </div>

      {/* Comments thread */}
      {detail && (
        <div className="border-t border-gray-100 mt-5 pt-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-3">
            💬 Comments {detail.comments.length > 0 && `· ${detail.comments.length}`}
          </div>
          <CommentsThread postId={row.id} comments={detail.comments} personKey={personKey} accent={accent} onAdded={onDetailChanged} />
        </div>
      )}

      {/* Activity log */}
      {detail && detail.activity.length > 0 && (
        <div className="border-t border-gray-100 mt-5 pt-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-3">Activity</div>
          <div className="space-y-1.5">
            {detail.activity.slice(0, 5).map((a) => (
              <div key={a.id} className="text-xs text-gray-600 flex gap-2">
                <span className="text-gray-400 flex-shrink-0 w-14">{relTime(a.created_at)}</span>
                <span><span className="text-gray-800 font-medium">{a.actorName}</span> {a.detail || a.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduler line */}
      {detail?.scheduler.syncedToScheduler && detail.scheduler.startAt && (
        <div className="border-t border-gray-100 mt-5 pt-4">
          <div className="text-xs text-gray-600 flex items-center gap-2">
            <span>📅</span>
            <span>
              Scheduled to publish{" "}
              <span className="font-medium text-gray-800">
                {new Date(detail.scheduler.startAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>{" "}
              via Post Scheduler
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-gray-100 mt-5 pt-4 flex gap-2 items-center flex-wrap">
        <button
          onClick={onEdit}
          className="flex-1 px-4 py-2 rounded text-sm font-medium text-white hover:opacity-90"
          style={{ background: accent }}
        >
          Edit task
        </button>
        <button
          onClick={markDone}
          disabled={busyStatus !== null || currentRank >= 5}
          className="px-5 py-2 rounded text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
        >
          {busyStatus ? "Saving…" : currentRank >= 5 ? "Done" : "Mark done"}
        </button>
        <TakeOverButton row={row} personKey={personKey} onDone={onSaved} />
      </div>
    </div>
  );
}

function ClaimRowButton({ postId, personKey, onDone }: { postId: string; personKey: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function claim(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await fetch("/api/marketing-hub/takeover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, newOwnerKey: personKey }),
      });
      const j = await r.json();
      if (!r.ok || j.error) alert(`Failed: ${j.error || r.status}`);
      else onDone();
    } finally { setBusy(false); }
  }
  return (
    <button
      onClick={claim}
      disabled={busy}
      className="absolute top-2 right-2 text-[10px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 disabled:opacity-50"
      title="Claim this task — you become the owner, current owner joins as collaborator"
    >
      {busy ? "…" : "Claim"}
    </button>
  );
}

function TakeOverButton({ row, personKey, onDone }: { row: Row; personKey: string; onDone: () => void }) {
  const isVideo = /reel|video|long.*form/i.test(row.type || "");
  const isEditor = personKey === "nikhil" || personKey === "nandu";
  const ownerKey = String(row.owner || "").toLowerCase();
  const currentOwnerIsSiblingEditor = (ownerKey.includes("nikhil") || ownerKey.includes("nandu")) && !ownerKey.includes(personKey);
  const showButton = isVideo && isEditor && currentOwnerIsSiblingEditor;
  const [busy, setBusy] = useState(false);
  if (!showButton) return null;

  async function claim() {
    if (!confirm(`Take over this task from ${row.owner}?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/marketing-hub/takeover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: row.id, newOwnerKey: personKey }),
      });
      const j = await r.json();
      if (!r.ok || j.error) alert(`Failed: ${j.error || r.status}`);
      else onDone();
    } finally { setBusy(false); }
  }

  return (
    <button
      onClick={claim}
      disabled={busy}
      className="px-4 py-2 rounded text-sm border-2 border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium disabled:opacity-40"
      title={`Claim this task — ${row.owner} will step down`}
    >
      {busy ? "Claiming…" : "🎬 Take over"}
    </button>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CommentsThread({ postId, comments, personKey, accent, onAdded }: {
  postId: string; comments: Comment[]; personKey: string; accent: string; onAdded: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? comments : comments.slice(0, 3);

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/marketing-hub/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, authorKey: personKey, body: draft.trim() }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { alert(`Failed: ${j.error || r.status}`); return; }
      setDraft("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {comments.length === 0 && (
        <div className="text-xs text-gray-400 mb-3">No comments yet. Kick off the thread below.</div>
      )}
      <div className="space-y-2 mb-3">
        {shown.map((c) => (
          <div key={c.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-gray-800">{c.authorName}</span>
              <span className="text-[10px] text-gray-400">{relTime(c.created_at)}</span>
            </div>
            <div className="text-gray-700 whitespace-pre-wrap mt-0.5">{c.body}</div>
          </div>
        ))}
        {!expanded && comments.length > 3 && (
          <button onClick={() => setExpanded(true)} className="text-xs text-gray-500 hover:text-gray-800">
            View all {comments.length} comments →
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a comment…"
          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="px-4 py-1.5 rounded-full text-sm font-medium text-white disabled:opacity-40"
          style={{ background: accent }}
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function HorizontalTimeline({ currentRank, accent }: { currentRank: number; accent: string }) {
  return (
    <div className="relative grid grid-cols-5 gap-0">
      {/* Connector line */}
      <div className="absolute top-2 left-[10%] right-[10%] h-[2px] bg-gray-100" />
      {TIMELINE_STAGES.map((stage) => {
        const done = currentRank > stage.rank;
        const active = currentRank === stage.rank || (stage.rank === 5 && currentRank === 4);
        return (
          <div key={stage.rank} className="relative z-10 text-center">
            {active ? (
              <div
                className="w-5 h-5 rounded-full mx-auto mb-1.5 border-2 border-white"
                style={{ background: accent, boxShadow: `0 0 0 2px ${accent}` }}
              />
            ) : done ? (
              <div className="w-4 h-4 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white text-[9px]" style={{ background: "#5DCAA5" }}>
                ✓
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full mx-auto mb-1.5 border-2 border-gray-200 bg-white" />
            )}
            <div className={`text-[11px] ${active ? "font-medium" : done ? "" : "text-gray-400"}`} style={active ? { color: accent } : {}}>
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Preset teams — role-aware. What "usual team" means depends on who is looking.
// Writer viewing → adds downstream owner (designer/editor) + reviewer.
// Designer/editor viewing → adds writer (Manya) + reviewer, because handoff already made them owner.
function usualTeamFor(type: string, viewerKey: string): { keys: string[]; label: string } {
  const t = type || "";
  const isStatic = /post|carousel|thumbnail|youtube.*(post|thumbnail)/i.test(t);
  const isSpeakingReel = /reel.*(original|edit|video)|long.*form/i.test(t);
  const isReel = /reel/i.test(t);

  // From designer/editor perspective, presets include the writer.
  if (viewerKey === "praveen" && isStatic)                                return { keys: ["manya", "maheen"],   label: "Writer + Reviewer (Manya, Maheen)" };
  if (viewerKey === "nikhil" && (isSpeakingReel || isReel))               return { keys: ["nandu", "manya", "maheen"], label: "Sibling + Writer + Reviewer (Nandu, Manya, Maheen)" };
  if (viewerKey === "nandu" && isReel)                                    return { keys: ["nikhil", "manya", "maheen"], label: "Sibling + Writer + Reviewer (Nikhil, Manya, Maheen)" };

  // From writer perspective, presets include downstream owner.
  if (isStatic)         return { keys: ["praveen", "maheen"], label: "Designer + Reviewer (Praveen, Maheen)" };
  if (isSpeakingReel)   return { keys: ["nikhil", "maheen"],  label: "Editor + Reviewer (Nikhil, Maheen)" };
  if (isReel)           return { keys: ["nandu", "maheen"],   label: "Editor + Reviewer (Nandu, Maheen)" };
  return                       { keys: ["maheen"],            label: "Reviewer (Maheen)" };
}

function TeamStrip({ postId, type, ownerName, viewerKey, collaborators, onChanged }: {
  postId: string; type: string; ownerName: string; viewerKey: string; collaborators: Collaborator[]; onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const present = new Set(collaborators.map((c) => c.key));
  const availablePeople = [...TEAM, { key: "maheen", label: "Maheen", role: "editor" as Role, color: "#7C6BAF" }].filter((p) => !present.has(p.key));

  const preset = usualTeamFor(type, viewerKey);
  const presetToAdd = preset.keys.filter((k) => !present.has(k));

  // Split collaborators into owner (matches row.owner display name) and helpers.
  const ownerNorm = (ownerName || "").toLowerCase();
  const owner = collaborators.find((c) => ownerNorm.includes(c.key) || c.name.toLowerCase() === ownerNorm);
  const helpers = collaborators.filter((c) => c !== owner);

  async function addOne(key: string) {
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, memberKey: key }),
      });
      onChanged();
      setPicking(false);
    } finally { setBusy(false); }
  }

  async function addPreset() {
    if (presetToAdd.length === 0) return;
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, memberKeys: presetToAdd }),
      });
      onChanged();
    } finally { setBusy(false); }
  }

  async function remove(key: string) {
    setBusy(true);
    try {
      await fetch(`/api/marketing-hub/collaborators?postId=${postId}&memberKey=${key}`, { method: "DELETE" });
      onChanged();
    } finally { setBusy(false); }
  }

  const paletteFor = (k: string) => TEAM.find((p) => p.key === k)?.color || "#7C6BAF";

  return (
    <div className="mb-4 pb-4 border-b border-gray-100">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Team on this task</div>

      <div className="flex items-start gap-3 flex-wrap">
        {/* Owner — big card */}
        {owner && (
          <div className="group flex items-center gap-3 rounded-xl px-3 py-2 border" style={{ borderColor: paletteFor(owner.key) + "55", background: paletteFor(owner.key) + "0A" }}>
            <div className="w-10 h-10 rounded-full text-white flex items-center justify-center text-base font-medium" style={{ background: paletteFor(owner.key) }}>
              {owner.name.charAt(0)}
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: paletteFor(owner.key) }}>Owner</div>
              <div className="text-sm font-medium leading-tight">{owner.name}</div>
              <div className="text-[10px] text-gray-500 leading-tight">{owner.role || ""}</div>
            </div>
          </div>
        )}

        {/* Helpers — smaller chips */}
        {helpers.map((c) => (
          <div key={c.key} className="group flex items-center gap-2 rounded-xl px-3 py-2 border border-gray-100 bg-gray-50/60">
            <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-medium" style={{ background: paletteFor(c.key) }}>
              {c.name.charAt(0)}
            </div>
            <div className="pr-1">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Collaborator</div>
              <div className="text-sm leading-tight">{c.name}</div>
              <div className="text-[10px] text-gray-500 leading-tight">{c.role || ""}</div>
            </div>
            <button
              onClick={() => remove(c.key)}
              disabled={busy}
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-lg leading-none"
              title="Remove"
            >×</button>
          </div>
        ))}

        {/* + Add */}
        <div className="relative">
          <button
            onClick={() => setPicking((v) => !v)}
            disabled={busy || availablePeople.length === 0}
            className="h-full min-h-[56px] px-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-800 disabled:opacity-40"
          >
            + Add
          </button>
          {picking && availablePeople.length > 0 && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
              {availablePeople.map((p) => (
                <button
                  key={p.key}
                  onClick={() => addOne(p.key)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full text-white text-[10px] font-medium flex items-center justify-center" style={{ background: p.color }}>
                    {p.label.charAt(0)}
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {presetToAdd.length > 0 && (
        <button
          onClick={addPreset}
          disabled={busy}
          className="mt-2 text-[11px] px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          title={preset.label}
        >
          ✨ Add usual team ({preset.keys.map((k) => TEAM.find((p) => p.key === k)?.label || k[0].toUpperCase() + k.slice(1)).join(" + ")})
        </button>
      )}
    </div>
  );
}

function CreativeFiles({ postId, personRow, attachments, personKey, accent, onChanged, onTaskAdvanced }: {
  postId: string; personRow: Row; attachments: Attachment[]; personKey: string; accent: string; onChanged: () => void; onTaskAdvanced: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isDesignerOrEditor = personKey === "praveen" || personKey === "nikhil" || personKey === "nandu";

  async function upload(files: FileList | File[]) {
    setErr(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("postId", postId);
        fd.append("uploadedBy", personKey);
        fd.append("file", file);
        const r = await fetch(`/api/marketing-hub/attach`, { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok || j.error) { setErr(j.error || `HTTP ${r.status}`); break; }
      }

      // Auto-advance status: if a designer / editor uploads while task sits at
      // "Content - Approved", the task is now Output Ready (their work is uploaded).
      if (isDesignerOrEditor && personRow.status === "Content - Approved") {
        const patch = await fetch(`/api/marketing-hub/update`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: postId, fields: { status: "Output - Ready" } }),
        });
        if (patch.ok) {
          setToast("Auto-advanced to Output Ready");
          setTimeout(() => setToast(null), 3500);
          onTaskAdvanced();
        }
      }
      onChanged();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return;
    const r = await fetch(`/api/marketing-hub/attach?id=${id}`, { method: "DELETE" });
    if (r.ok) onChanged();
  }

  return (
    <div>
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {attachments.map((a) => {
            const isImg = (a.mime_type || "").startsWith("image/");
            const isVid = (a.mime_type || "").startsWith("video/");
            return (
              <div key={a.id} className="relative group flex-shrink-0 w-28 h-28 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                <a href={a.storage_path} target="_blank" rel="noreferrer" className="block w-full h-full" title={a.filename}>
                  {isImg ? (
                    <img src={a.storage_path} alt={a.filename} className="w-full h-full object-cover" />
                  ) : isVid ? (
                    <video src={a.storage_path} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2">
                      <div className="text-2xl">📎</div>
                      <div className="text-[9px] text-gray-500 mt-1 truncate w-full text-center">{a.filename}</div>
                    </div>
                  )}
                </a>
                <button
                  onClick={() => remove(a.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition"
                  title="Delete"
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${dragOver ? "" : "border-gray-200 hover:border-gray-300"}`}
        style={dragOver ? { borderColor: accent, background: accent + "0A" } : {}}
      >
        {busy ? (
          <div className="text-sm text-gray-700">Uploading…</div>
        ) : (
          <>
            <div className="text-2xl mb-1">📤</div>
            <div className="text-sm font-medium" style={{ color: accent }}>
              Click to upload {isDesignerOrEditor ? "your creative" : "reference files"}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              or drag & drop — up to 25 MB per file{isDesignerOrEditor && personRow.status === "Content - Approved" && " · task auto-moves to Output Ready on upload"}
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }}
        />
      </div>

      {toast && (
        <div className="mt-2 text-xs px-3 py-2 rounded bg-green-50 border border-green-200 text-green-800">
          ✅ {toast}
        </div>
      )}
      {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
    </div>
  );
}

function AutoTextarea({ value, onChange, minRows = 2, placeholder }: {
  value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={minRows}
      placeholder={placeholder}
      className="w-full mt-1 text-sm px-3 py-2 border border-gray-200 rounded bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 leading-relaxed resize-none overflow-hidden"
    />
  );
}

function EditForm({ row, accent, currentRank, onClose, onCancel, onSaved }: {
  row: Row; accent: string; currentRank: number;
  onClose: () => void; onCancel: () => void; onSaved: () => void;
}) {
  const [particulars, setParticulars] = useState(row.particulars);
  const [status, setStatus] = useState(row.status);
  const [priority, setPriority] = useState(row.priority || "Medium");
  const [publishingDate, setPublishingDate] = useState(row.publishingDate?.slice(0, 10) || "");
  const [dueDate, setDueDate] = useState(row.dueDate?.slice(0, 10) || "");
  const [sbu, setSbu] = useState(row.sbu);
  const [content, setContent] = useState(row.content);
  const [caption, setCaption] = useState(row.caption);
  const [additionalInfo, setAdditionalInfo] = useState(row.additionalInfo);
  const [needsReview, setNeedsReview] = useState(row.needsReview);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Track how many fields differ from the original row for the "N unsaved changes" indicator.
  const dirtyCount = [
    particulars !== row.particulars,
    status !== row.status,
    priority !== (row.priority || "Medium"),
    publishingDate !== (row.publishingDate?.slice(0, 10) || ""),
    dueDate !== (row.dueDate?.slice(0, 10) || ""),
    sbu !== row.sbu,
    content !== row.content,
    caption !== row.caption,
    additionalInfo !== row.additionalInfo,
    needsReview !== row.needsReview,
  ].filter(Boolean).length;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/marketing-hub/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          fields: {
            particulars,
            status,
            priority,
            publishing_date: publishingDate || null,
            due_date: dueDate || null,
            sbu: sbu || null,
            content: content || null,
            caption: caption || null,
            additional_info: additionalInfo || null,
            needs_review: needsReview,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || `HTTP ${r.status}`); return; }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header — editable title */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: accent }}>Editing task</div>
          <input
            type="text"
            value={particulars}
            onChange={(e) => setParticulars(e.target.value)}
            className="w-full text-xl font-medium mt-1 leading-tight bg-transparent border-b border-gray-100 focus:border-gray-300 outline-none py-1"
          />
          <div className="text-xs text-gray-500 mt-1">{row.type || "—"} · {sbu || row.sbu || "—"}</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
      </div>

      {/* Details form */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">Details</div>

        <label className="block">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Content brief</span>
          <AutoTextarea value={content} onChange={setContent} minRows={3} />
        </label>

        <label className="block mt-3">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Caption draft</span>
          <AutoTextarea value={caption} onChange={setCaption} minRows={3} placeholder="Draft the IG caption here…" />
        </label>

        <label className="block mt-3">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Feedback / notes</span>
          <AutoTextarea value={additionalInfo} onChange={setAdditionalInfo} minRows={2} placeholder="Reviewer feedback, follow-up notes…" />
        </label>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full mt-1 text-sm px-2 py-1.5 border border-gray-200 rounded bg-white">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full mt-1 text-sm px-2 py-1.5 border border-gray-200 rounded bg-white">
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">SBU</span>
            <input type="text" value={sbu} onChange={(e) => setSbu(e.target.value)} className="w-full mt-1 text-sm px-2 py-1.5 border border-gray-200 rounded" />
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Needs review</span>
            <div className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} className="h-4 w-4 rounded cursor-pointer" style={{ accentColor: accent }} />
              <span className="text-xs text-gray-600">Flag for Maheen</span>
            </div>
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Publish date</span>
            <input type="date" value={publishingDate} onChange={(e) => setPublishingDate(e.target.value)} className="w-full mt-1 text-sm px-2 py-1.5 border border-gray-200 rounded" />
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Due date</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full mt-1 text-sm px-2 py-1.5 border border-gray-200 rounded" />
          </label>
        </div>
      </div>

      {/* Timeline (read-only) */}
      <div className="border-t border-gray-100 mt-5 pt-4 opacity-70">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-3">Timeline · read-only</div>
        <HorizontalTimeline currentRank={currentRank} accent={accent} />
      </div>

      {err && <div className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{err}</div>}

      {/* Actions */}
      <div className="border-t border-gray-100 mt-5 pt-4 flex gap-2 items-center">
        <div className="text-xs text-gray-500 mr-auto">
          {dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}` : "No changes yet"}
        </div>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2 rounded text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || dirtyCount === 0}
          className="px-5 py-2 rounded text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
