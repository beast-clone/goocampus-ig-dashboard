"use client";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewTaskButton } from "@/components/NewTaskModal";
import { useApi } from "@/lib/use-api";

// Content creator's personal home view.
//
// Answers ONE question when the tab opens: "What do I work on right now?"
// Reuses the Marketing Hub endpoint (/api/marketing-hub) — same underlying rows,
// filtered client-side to the selected person, organized into task buckets.
//
// Person selection persists in localStorage so the tab remembers who you are.

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

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtRelativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN");
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
  // Widen the fetch to cover the wider "this week" bucket even when the range is small.
  const wideTo = new Date(Math.max(new Date(range.to).getTime(), Date.now() + 14 * 86_400_000)).toISOString().slice(0, 10);
  const wideFrom = new Date(Math.min(new Date(range.from).getTime(), Date.now() - 14 * 86_400_000)).toISOString().slice(0, 10);
  const qs = new URLSearchParams({ from: wideFrom, to: wideTo }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);

  const [personKey, setPersonKey] = useState<string>("manya");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_KEY);
      if (saved && TEAM.some((p) => p.key === saved)) setPersonKey(saved);
    } catch { /* private-mode: fall back to default */ }
  }, []);
  const setPerson = (k: string) => {
    setPersonKey(k);
    try { window.localStorage.setItem(LS_KEY, k); } catch { /* ignore */ }
  };

  const person = TEAM.find((p) => p.key === personKey) || TEAM[0];
  const todayStr = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));

  const mine = useMemo(() => (data?.rows || []).filter((r) => ownerMatches(r.owner, person)), [data, person]);

  const buckets = useMemo(() => {
    const nextUp: Row[] = [];
    const today: Row[] = [];
    const waiting: Row[] = [];
    const week: Row[] = [];
    const wins: Row[] = [];

    const sorted = [...mine].sort((a, b) => {
      const aOverdue = !!a.dueDate && (a.dueDate.slice(0, 10) < todayStr);
      const bOverdue = !!b.dueDate && (b.dueDate.slice(0, 10) < todayStr);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const aPd = a.publishingDate?.slice(0, 10) || "9999-12-31";
      const bPd = b.publishingDate?.slice(0, 10) || "9999-12-31";
      return aPd.localeCompare(bPd);
    });

    for (const r of sorted) {
      const pd = r.publishingDate?.slice(0, 10) || "";
      const dd = r.dueDate?.slice(0, 10) || "";
      const isDone = DONE_STATUSES.includes(r.status);

      if (isDone && r.completionTime && r.completionTime.slice(0, 10) >= weekAgo) {
        wins.push(r);
        continue;
      }
      if (isDone) continue;

      if (r.needsReview) {
        waiting.push(r);
        continue;
      }
      if (pd === todayStr || (dd && dd <= todayStr)) {
        today.push(r);
        continue;
      }
      if (pd && pd > todayStr && pd <= weekAhead) {
        week.push(r);
      }
    }

    // Next Up = single most urgent thing. Overdue first, then today, then earliest upcoming.
    nextUp.push(...today.slice(0, 1));
    if (nextUp.length === 0 && waiting.length > 0) nextUp.push(waiting[0]);
    if (nextUp.length === 0 && week.length > 0) nextUp.push(week[0]);

    return { nextUp, today, waiting, week, wins };
  }, [mine, todayStr, weekAhead, weekAgo]);

  // Notifications rail — recent Airtable activity across ALL posts (not just this person's),
  // scoped to items where this person is owner OR a collaborator so the feed feels relevant.
  const activity = useMemo(() => {
    if (!data) return [];
    return [...data.rows]
      .filter((r) => ownerMatches(r.owner, person) || r.collaborators.some((c) => person.aliases.includes(c)))
      .filter((r) => r.lastModified)
      .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
      .slice(0, 15);
  }, [data, person]);

  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = openId ? data?.rows.find((r) => r.id === openId) || null : null;

  return (
    <div className="space-y-6">
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
            {mine.length > 0 && ` · ${buckets.today.length} today, ${buckets.waiting.length} waiting on you`}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Next Up — the hero */}
          <NextUpHero row={buckets.nextUp[0] || null} person={person} onOpen={setOpenId} loading={isLoading && !data} />

          {/* Today's queue */}
          <Section title="🎯 Today's queue" count={buckets.today.length} empty="Nothing on for today. Clear runway.">
            {buckets.today.map((r) => <TaskCard key={r.id} row={r} onOpen={setOpenId} showDate />)}
          </Section>

          {/* Waiting on me */}
          <Section title="✋ Waiting on you" count={buckets.waiting.length} empty="Nothing waiting on you.">
            {buckets.waiting.map((r) => <TaskCard key={r.id} row={r} onOpen={setOpenId} accent="#7F77DD" />)}
          </Section>

          {/* This week */}
          <Section title="🗓 Coming up this week" count={buckets.week.length} empty="Nothing scheduled for the next 7 days.">
            <div className="grid grid-cols-2 gap-3">
              {buckets.week.slice(0, 8).map((r) => <TaskCard key={r.id} row={r} onOpen={setOpenId} showDate compact />)}
            </div>
            {buckets.week.length > 8 && <div className="text-sm text-gray-400 mt-3">+{buckets.week.length - 8} more later this week</div>}
          </Section>

          {/* Wins */}
          {buckets.wins.length > 0 && (
            <Section title="🎉 Wins this week" count={buckets.wins.length}>
              <div className="flex flex-wrap gap-2">
                {buckets.wins.slice(0, 6).map((r) => (
                  <button key={r.id} onClick={() => setOpenId(r.id)} className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-800 hover:bg-green-100 border border-green-100">
                    {r.particulars || "(untitled)"}
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Notifications rail */}
        <div className="col-span-1">
          <div className="bg-white border border-gray-100 rounded-lg p-5 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-medium">Activity</div>
              <div className="text-xs text-gray-400">Comments · Phase 2</div>
            </div>
            <div className="text-xs text-gray-500 mb-4">Recent updates on posts you own or collaborate on.</div>
            {activity.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">No recent activity.</div>
            ) : (
              <div className="space-y-3">
                {activity.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="w-full text-left hover:bg-gray-50 rounded p-2 -mx-2 transition"
                  >
                    <div className="text-sm truncate">{r.particulars || "(untitled)"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {r.status} · {fmtRelativeTime(r.lastModified)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {openRow && <DetailModal row={openRow} onClose={() => setOpenId(null)} />}

      <NewTaskButton onCreated={refresh} />
    </div>
  );
}

function NextUpHero({ row, person, onOpen, loading }: { row: Row | null; person: Person; onOpen: (id: string) => void; loading: boolean }) {
  if (loading) {
    return <div className="bg-white border border-gray-100 rounded-lg p-10 text-center text-gray-400">Finding your next task…</div>;
  }
  if (!row) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-white border border-green-100 rounded-lg p-10 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <div className="text-lg font-medium">You&apos;re all clear.</div>
        <div className="text-sm text-gray-500 mt-1">Nothing pending for {person.label}. Enjoy the breather.</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg p-6 border" style={{ background: person.color + "0A", borderColor: person.color + "33" }}>
      <div className="text-xs uppercase tracking-wider mb-3" style={{ color: person.color }}>Next up</div>
      <div className="flex items-start gap-6">
        {row.attachments[0]?.type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.attachments[0].url} alt="" className="w-32 h-32 object-cover rounded-lg flex-shrink-0" />
        ) : (
          <div className="w-32 h-32 rounded-lg flex-shrink-0 flex items-center justify-center text-3xl" style={{ background: person.color + "22" }}>
            {row.type.includes("Reel") ? "🎬" : row.type.includes("Carousel") ? "📸" : row.type.includes("Thumbnail") ? "🖼" : "📝"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-medium mb-2">{row.particulars || "(untitled)"}</div>
          <div className="text-sm text-gray-600 mb-3">
            {row.type} · {row.sbu}
            {row.publishingDate && ` · Publishes ${new Date(row.publishingDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`}
          </div>
          {row.content && (
            <div className="text-sm text-gray-700 line-clamp-2 mb-4" dangerouslySetInnerHTML={{ __html: row.content.slice(0, 200) }} />
          )}
          <button
            onClick={() => onOpen(row.id)}
            className="px-5 py-2.5 rounded text-white text-sm font-medium hover:opacity-90"
            style={{ background: person.color }}
          >
            Start work →
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-lg font-medium">{title}</div>
        <div className="text-sm text-gray-400">{count}</div>
      </div>
      {count === 0 && empty ? (
        <div className="bg-white border border-gray-100 rounded-lg p-6 text-sm text-gray-400 text-center">{empty}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function TaskCard({ row, onOpen, showDate, accent, compact }: { row: Row; onOpen: (id: string) => void; showDate?: boolean; accent?: string; compact?: boolean }) {
  return (
    <button
      onClick={() => onOpen(row.id)}
      className={`w-full text-left bg-white border border-gray-100 rounded-lg ${compact ? "p-3" : "p-4"} hover:border-brand hover:shadow-sm transition`}
      style={accent ? { borderLeft: `4px solid ${accent}` } : {}}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className={`${compact ? "text-sm" : "text-base"} font-medium truncate`}>{row.particulars || "(untitled)"}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {row.type} · {row.sbu}
            {showDate && row.publishingDate && ` · ${new Date(row.publishingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
          </div>
        </div>
        <div className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ background: "#F1EFE8", color: "#444441" }}>{row.status}</div>
      </div>
    </button>
  );
}

function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-4xl my-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <div className="text-xl font-medium">{row.particulars || "(untitled)"}</div>
            <div className="text-sm text-gray-500 mt-1">{row.sbu} · {row.type} · Publishing {row.publishingDate?.slice(0, 10) || "—"}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>
        <div className="px-8 py-6 space-y-5">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-gray-500 uppercase tracking-wide">Status</div><div className="mt-1">{row.status || "—"}</div></div>
            <div><div className="text-xs text-gray-500 uppercase tracking-wide">Owner</div><div className="mt-1">{row.owner || "—"}</div></div>
            <div><div className="text-xs text-gray-500 uppercase tracking-wide">Due date</div><div className="mt-1">{row.dueDate?.slice(0, 10) || "—"}</div></div>
          </div>
          {row.attachments.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Attachments</div>
              <div className="grid grid-cols-4 gap-3">
                {row.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block border border-gray-100 rounded overflow-hidden hover:border-brand">
                    {a.type?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.filename} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">{a.type || "file"}</div>
                    )}
                    <div className="p-2 text-xs text-gray-600 truncate">{a.filename}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
          {row.caption && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Caption</div>
              <div className="text-sm whitespace-pre-wrap">{row.caption}</div>
            </div>
          )}
          {row.content && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Content brief</div>
              <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: row.content }} />
            </div>
          )}
          {(row.outputLink || row.link) && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Links</div>
              {row.outputLink && <div className="text-sm"><span className="text-gray-500 mr-2">Output:</span><a href={row.outputLink} target="_blank" rel="noreferrer" className="text-brand hover:underline">{row.outputLink}</a></div>}
              {row.link && <div className="text-sm mt-1"><span className="text-gray-500 mr-2">Link:</span><a href={row.link} target="_blank" rel="noreferrer" className="text-brand hover:underline">{row.link}</a></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
