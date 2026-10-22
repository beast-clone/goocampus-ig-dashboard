"use client";
import { useEffect, useRef, useState } from "react";
import { uploadTaskFile, inNumberOrder } from "@/lib/upload-task-file";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import type { AttachKind } from "@/lib/attach-rules";

// Upload queue for a task's file boxes (Praveen, 22 Oct — "like Slack"). Each picked
// file shows a tile at once, with a preview and a progress ring, so nobody thinks the
// upload failed and adds the same files again. Files go up one by one, in number
// order. A file whose name is already on the task is called out before uploading —
// skip it, or upload it anyway.
export type PendingUpload = {
  key: string; name: string; preview: string | null; type: "image" | "video" | "doc";
  pct: number; state: "waiting" | "up" | "done" | "err"; error?: string;
  base: number;   // how many files of this name the task had when it was added
};

const typeOf = (f: File): PendingUpload["type"] =>
  f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "doc";

export function useUploadQueue({ postId, kind, uploadedBy, existing, onSaved, onError, prepare }: {
  postId: string; kind: AttachKind; uploadedBy?: string;
  /** File names already on the task — for the duplicate check and to know when a tile has landed. */
  existing: string[];
  onSaved: () => void;
  onError?: (name: string, msg: string) => void;
  /** Optional step before upload (the task window compresses images). */
  prepare?: (f: File) => Promise<File>;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  // Compared without the extension: the task window turns big images into JPEGs, so
  // "303.png" lands as "303.jpg" and is still the same file.
  const stem = (n: string) => n.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const countOf = (name: string, list: string[]) => list.filter((n) => stem(n) === stem(name)).length;
  const patch = (key: string, p: Partial<PendingUpload>) => setPending((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)));

  // A finished tile goes once the real file has shown up in the list (its name count
  // went up) — so the preview hands over to the real tile without a blank moment.
  useEffect(() => {
    setPending((q) => {
      const keep = q.filter((x) => !(x.state === "done" && countOf(x.name, existing) > x.base));
      q.filter((x) => !keep.includes(x)).forEach((x) => x.preview && URL.revokeObjectURL(x.preview));
      return keep.length === q.length ? q : keep;
    });
  }, [existing.join("\u0000")]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    let list = inNumberOrder(files);
    const taken = [...existing, ...pendingRef.current.filter((p) => p.state !== "err").map((p) => p.name)];
    const dups = list.filter((f) => countOf(f.name, taken) > 0);
    if (dups.length) {
      const names = dups.map((f) => f.name);
      const again = await confirmDialog({
        title: dups.length === 1 ? `${names[0]} is already on this task` : `${dups.length} of these files are already on this task`,
        body: <>{names.slice(0, 8).join(", ")}{names.length > 8 ? ` and ${names.length - 8} more` : ""} — a file with the same name was uploaded before. Upload {dups.length === 1 ? "it" : "them"} again anyway?</>,
        action: "Upload anyway", cancel: dups.length === list.length ? "Don't upload" : "Skip duplicates",
      });
      if (!again) list = list.filter((f) => !dups.includes(f));
    }
    if (!list.length) return;
    const items: PendingUpload[] = list.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`, name: f.name, type: typeOf(f),
      preview: typeOf(f) === "image" ? URL.createObjectURL(f) : null,
      pct: 0, state: "waiting", base: countOf(f.name, existing),
    }));
    setPending((q) => [...q, ...items]);
    for (let i = 0; i < list.length; i++) {
      const it = items[i];
      patch(it.key, { state: "up" });
      const file = prepare ? await prepare(list[i]).catch(() => list[i]) : list[i];
      const r = await uploadTaskFile(postId, file, kind, uploadedBy, (pct) => patch(it.key, { pct }));
      if (r.ok) patch(it.key, { state: "done", pct: 100 });
      else { patch(it.key, { state: "err", error: r.error }); onError?.(it.name, r.error); }
    }
    onSaved();
  };
  const dismiss = (key: string) => setPending((q) => q.filter((x) => { if (x.key === key && x.preview) URL.revokeObjectURL(x.preview); return x.key !== key; }));
  const busy = pending.some((p) => p.state === "waiting" || p.state === "up");
  // "2 of 5 · 40%" — for places that show a line rather than tiles.
  const live = pending.filter((p) => p.state !== "err");
  const doneN = live.filter((p) => p.state === "done").length;
  const cur = live.find((p) => p.state === "up");
  const status = busy ? `Uploading ${Math.min(doneN + 1, live.length)} of ${live.length}${cur ? ` · ${cur.pct}%` : ""}` : "";
  return { pending, add, dismiss, busy, status };
}
