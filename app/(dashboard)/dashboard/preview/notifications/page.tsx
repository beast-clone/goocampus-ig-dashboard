"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconCheck, IconChecks, IconExternalLink, IconTrash, IconPin } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useApi } from "@/lib/use-api";
import { NOTIF_REFRESH, patchNotifs, taskHref, type NotifItem } from "@/app/(dashboard)/dashboard/preview/NotificationHost";

// The Notifications tab — every notification the signed-in person has received,
// kept until they delete it, grouped by category (docs/NOTIFICATIONS_SPEC.md).
// Open action items are pinned at the top until the action is actually done;
// reading one does not unpin it.

type Cat = "all" | "action" | "assigned" | "pool" | "progress" | "dates";
const CATS: { key: Exclude<Cat, "all">; label: string }[] = [
  { key: "action",   label: "Action needed" },
  { key: "assigned", label: "Assigned to you" },
  { key: "pool",     label: "Claims & pool" },
  { key: "progress", label: "Your tasks' progress" },
  { key: "dates",    label: "Dates & schedule" },
];
const label = (c: string) => CATS.find((x) => x.key === c)?.label || c;
const isOpenAction = (n: NotifItem) => n.action_needed && !n.done_at;

const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};

export default function NotificationsPage() {
  return (
    <PreviewDashboardShell active="notifications" title="Notifications" subtitle="Everything that's happened to your work — kept until you delete it." hideAccountPicker hideRange>
      {() => <NotificationsList />}
    </PreviewDashboardShell>
  );
}

function NotificationsList() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useApi<{ items: NotifItem[] }>("/api/notifications");
  const [cat, setCat] = useState<Cat>("all");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const items = useMemo(() => data?.items || [], [data]);

  // The pop-up host and this page share state — keep them in step both ways.
  useEffect(() => {
    const on = () => { mutate(); };
    window.addEventListener(NOTIF_REFRESH, on);
    return () => window.removeEventListener(NOTIF_REFRESH, on);
  }, [mutate]);

  const counts = useMemo(() => {
    const c: Record<string, { total: number; unread: number }> = { all: { total: items.length, unread: 0 } };
    for (const k of CATS) c[k.key] = { total: 0, unread: 0 };
    for (const n of items) {
      c[n.category] ??= { total: 0, unread: 0 };
      c[n.category].total++;
      if (!n.read_at) { c[n.category].unread++; c.all.unread++; }
    }
    return c;
  }, [items]);

  const pinned = items.filter(isOpenAction);
  const rest = items.filter((n) => !isOpenAction(n) && (cat === "all" || n.category === cat));
  // "All" reads as sections per category; a single category is one list.
  const sections = cat === "all"
    ? CATS.map((c) => ({ key: c.key, label: c.label, rows: rest.filter((n) => n.category === c.key) })).filter((s) => s.rows.length)
    : [{ key: cat, label: label(cat), rows: rest }];
  const showPinned = (cat === "all" || cat === "action") && pinned.length > 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setFailed(null);
    try { await fn(); await mutate(); window.dispatchEvent(new Event(NOTIF_REFRESH)); }
    catch (e) { setFailed((e as Error).message); }
    finally { setBusy(false); }
  };
  const open = (n: NotifItem) => run(async () => {
    if (!n.read_at) await patchNotifs({ op: "read", ids: [n.id] });
    if (n.post_id) router.push(taskHref(n.post_id));
  });
  const unreadHere = cat === "all" ? counts.all.unread : counts[cat]?.unread || 0;

  return (
    <div className="preview-scope flex flex-col gap-4">
      <div className="bg-white border border-gray-100 rounded-xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
          <IconBell size={20} stroke={1.8} className="text-brand" />
          <div className="text-[16px] font-medium text-[#232D42]">Your notifications</div>
          <button disabled={busy || unreadHere === 0}
            onClick={() => run(() => patchNotifs(cat === "all" ? { op: "read", all: true } : { op: "read", category: cat }))}
            className="ml-auto h-9 px-3 rounded border border-gray-200 text-[14px] text-[#4A5468] inline-flex items-center gap-1.5 hover:border-[#3A57E8] disabled:opacity-40">
            <IconChecks size={16} stroke={1.8} /> Mark {cat === "all" ? "all" : `"${label(cat)}"`} read
          </button>
        </div>
        <div className="flex gap-1.5 px-4 py-3 flex-wrap">
          {([{ key: "all", label: "All" }, ...CATS] as { key: Cat; label: string }[]).map((c) => {
            const on = cat === c.key;
            const u = counts[c.key]?.unread || 0;
            return (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`h-9 px-3 rounded text-[14px] font-medium transition inline-flex items-center gap-1.5 ${on ? "bg-[#E9ECFB] text-brand" : "text-[#8A92A6] hover:text-[#232D42] hover:bg-[#F6F7FB]"}`}>
                {c.label}
                {u > 0 && <span className={`text-[11px] rounded-full px-1.5 min-w-[18px] text-center ${c.key === "action" ? "bg-[#FFF1E8] text-[#C2410C]" : "bg-white text-brand border border-gray-100"}`}>{u}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {failed && <div className="rounded bg-[#FDECEA] text-[#8a2e28] text-[14px] px-3 py-2">{failed}</div>}

      {error ? (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-10 text-center text-[14px] text-rose-600">Couldn&apos;t load notifications: {error.message}</div>
      ) : isLoading && !data ? (
        <div className="bg-white border border-gray-100 rounded-xl"><LoadingBlock /></div>
      ) : (
        <>
          {showPinned && (
            <Section title="Needs you" sub="Pinned until the action is done — opening it doesn't clear it." icon={<IconPin size={18} stroke={1.8} className="text-[#C2410C]" />} accent>
              {pinned.map((n) => <Row key={n.id} n={n} busy={busy} onOpen={open} onRead={(x) => run(() => patchNotifs({ op: "read", ids: [x.id] }))} onDelete={(x) => run(() => patchNotifs({ op: "delete", ids: [x.id] }))} />)}
            </Section>
          )}
          {sections.map((s) => (
            <Section key={s.key} title={s.label}>
              {s.rows.map((n) => <Row key={n.id} n={n} busy={busy} onOpen={open} onRead={(x) => run(() => patchNotifs({ op: "read", ids: [x.id] }))} onDelete={(x) => run(() => patchNotifs({ op: "delete", ids: [x.id] }))} />)}
            </Section>
          ))}
          {!showPinned && sections.length === 0 && (
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-10 text-center text-[14px] text-[#8A92A6]">
              {cat === "all" ? "No notifications yet." : `Nothing in "${label(cat)}".`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, sub, icon, accent, children }: { title: string; sub?: string; icon?: React.ReactNode; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-white border rounded-xl ${accent ? "border-[#F3D3BE]" : "border-gray-100"}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${accent ? "bg-[#FFF8F3] border-[#F3D3BE] rounded-t-xl" : "border-gray-100"}`}>
        {icon}
        <div className="text-[14px] font-medium text-[#232D42]">{title}</div>
        {sub && <div className="text-[12px] text-[#8A92A6]">· {sub}</div>}
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function Row({ n, busy, onOpen, onRead, onDelete }: { n: NotifItem; busy: boolean; onOpen: (n: NotifItem) => void; onRead: (n: NotifItem) => void; onDelete: (n: NotifItem) => void }) {
  const unread = !n.read_at;
  const pendingAction = isOpenAction(n);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${unread ? "" : "bg-[#F6F7FB]/50"}`}>
      <span className="w-2 flex-shrink-0 pt-2">{unread && <span className="block w-2 h-2 rounded-full bg-brand" title="Unread" />}</span>
      <span className="text-[18px] leading-6 flex-shrink-0" aria-hidden>{n.emoji || "🔔"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[14px] ${unread ? "font-medium text-[#232D42]" : "text-[#4A5468]"}`}>{n.title}</span>
          {n.action_needed && n.done_at && <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#E8F6F0] text-[#2F9E6F]">Done</span>}
          {n.dismissed_at && !n.read_at && <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#F6F7FB] text-[#8A92A6]">Dismissed</span>}
        </div>
        {n.sub && <div className="text-[13px] text-[#8A92A6] mt-0.5">{n.sub}</div>}
        <div className="text-[12px] text-[#8A92A6] mt-1">{when(n.created_at)}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {n.post_id && (
          <button disabled={busy} onClick={() => onOpen(n)} title="Open the task"
            className="h-8 px-2.5 rounded border border-gray-200 text-[13px] text-[#4A5468] inline-flex items-center gap-1 hover:border-[#3A57E8] hover:text-brand disabled:opacity-40">
            <IconExternalLink size={14} stroke={1.8} /> Open
          </button>
        )}
        {unread && (
          <button disabled={busy} onClick={() => onRead(n)} title="Mark read"
            className="h-8 w-8 rounded border border-gray-200 text-[#4A5468] inline-flex items-center justify-center hover:border-[#3A57E8] hover:text-brand disabled:opacity-40">
            <IconCheck size={15} stroke={1.8} />
          </button>
        )}
        <button disabled={busy || pendingAction} onClick={() => onDelete(n)}
          title={pendingAction ? "Can't delete until the action is done — it's your only reminder" : "Delete"}
          className="h-8 w-8 rounded border border-gray-200 text-[#4A5468] inline-flex items-center justify-center hover:border-[#C03221] hover:text-[#C03221] disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-[#4A5468]">
          <IconTrash size={15} stroke={1.8} />
        </button>
      </div>
    </div>
  );
}
