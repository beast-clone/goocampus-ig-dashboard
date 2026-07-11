"use client";
import { useEffect, useState } from "react";

// Shared "+ New Task" modal used by Marketing Hub and My Day.
// POSTs to /api/marketing-hub/create, which writes one row to the
// Airtable Content Calendar table. Read-only otherwise: never PATCH or DELETE.

type Facets = {
  sbu: string[];
  type: string[];
  owner?: string[];
  priority?: string[];
  platforms?: string[];
};

const OWNER_OPTIONS = [
  { label: "Auto-assign (based on type)", value: "" },
  { label: "Manya", value: "Manya B M" },
  { label: "Praveen", value: "Praveen L" },
  { label: "Nikhil", value: "NIKHI Shyamraj" },
  { label: "Nandu", value: "Nandu C" },
];

const TYPE_OPTIONS = [
  "Post", "Carousel", "Reel - Original", "Reel - Cut", "Reel Thumbnail",
  "YouTube Long-Form", "YouTube Shorts", "YouTube Thumbnail",
  "Meta Ads", "Story (Image)", "Atomic Essay",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High"];

const PLATFORM_OPTIONS = ["Instagram", "Facebook", "YouTube", "LinkedIn"];

const FALLBACK_SBUS = [
  "10K Mentorship", "Australia-PGCP", "India NEET UG Consulting",
  "India NEET PG Consulting", "General Content", "Middle East",
  "Allied Courses", "UK ALS Course", "UK PGCP", "University Programs",
  "Interview Plus", "Portfolio Plus", "Buckingham Program",
  "Standard Consulting Program - Australia", "Standard Consulting Program - USA",
  "Standard Consulting Program - UK", "Dr Divij's Course",
  "Mentorship Platform",
];

export function NewTaskButton({ facets, onCreated }: { facets?: Facets; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-8 z-40 bg-brand text-white rounded-full shadow-lg hover:shadow-xl transition px-6 py-3 text-sm font-medium flex items-center gap-2"
      >
        <span className="text-lg leading-none">+</span> New task
      </button>
      {open && <NewTaskModal facets={facets} onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewTaskModal({ facets, onClose, onCreated }: { facets?: Facets; onClose: () => void; onCreated?: () => void }) {
  const sbus = (facets?.sbu && facets.sbu.length > 0) ? facets.sbu : FALLBACK_SBUS;

  const [title, setTitle] = useState("");
  const [sbu, setSbu] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [publishingDate, setPublishingDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [caption, setCaption] = useState("");
  const [needsReview, setNeedsReview] = useState(false);

  const [step, setStep] = useState<"form" | "confirm" | "saving" | "done" | "error">("form");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && step === "form") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  // Auto-default Due Date to one day before Publishing Date.
  useEffect(() => {
    if (publishingDate && !dueDate) {
      const d = new Date(publishingDate);
      d.setDate(d.getDate() - 1);
      setDueDate(d.toISOString().slice(0, 10));
    }
  }, [publishingDate, dueDate]);

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function goConfirm() {
    if (!title.trim()) {
      setErrMsg("Title is required.");
      return;
    }
    setErrMsg(null);
    setStep("confirm");
  }

  async function submit() {
    setStep("saving");
    try {
      const r = await fetch("/api/marketing-hub/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sbu: sbu || undefined,
          type: type || undefined,
          owner: owner || undefined,
          publishingDate: publishingDate || undefined,
          dueDate: dueDate || undefined,
          priority: priority || undefined,
          platforms: platforms.length > 0 ? platforms : undefined,
          content: content || undefined,
          caption: caption || undefined,
          needsReview: needsReview || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setErrMsg(j.error || `HTTP ${r.status}`);
        setStep("error");
        return;
      }
      setCreatedId(j.id);
      setStep("done");
      if (onCreated) onCreated();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  const ownerLabel = OWNER_OPTIONS.find((o) => o.value === owner)?.label || "Auto-assign";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={step === "form" ? onClose : undefined}>
      <div className="bg-white rounded-lg w-full max-w-3xl my-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <div className="text-xl font-medium">
              {step === "form" && "New task"}
              {step === "confirm" && "Confirm task"}
              {step === "saving" && "Creating…"}
              {step === "done" && "Task created"}
              {step === "error" && "Something went wrong"}
            </div>
            {step === "form" && <div className="text-sm text-gray-500 mt-0.5">Adds one row to the Marketing Hub Content Calendar.</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        {step === "form" && (
          <div className="px-8 py-6 space-y-5">
            <Field label="Title" required>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Australia AMC exemption pathway carousel"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-5">
              <Field label="SBU">
                <select value={sbu} onChange={(e) => setSbu(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                  <option value="">Not set</option>
                  {sbus.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                  <option value="">Not set</option>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Assign to" hint="Leave blank and Airtable's existing type-based rules will route it.">
                <select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                  {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Publishing date">
                <input type="date" value={publishingDate} onChange={(e) => setPublishingDate(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
              </Field>
              <Field label="Due date" hint="Defaults to one day before publishing.">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
              </Field>
            </div>

            <Field label="Platforms">
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`px-3 py-1.5 rounded text-sm border transition ${platforms.includes(p) ? "bg-brand text-white border-brand" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Content brief" hint="Notes, references, angle — anything the creator needs.">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="What's this post about, what's the angle, what should the CTA be?"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Caption" hint="Optional — creator can draft after.">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Draft caption if you already have one."
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex items-center gap-2">
              <input id="needs-review" type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
              <label htmlFor="needs-review" className="text-sm text-gray-700">Flag as &quot;Needs Review&quot;</label>
            </div>

            {errMsg && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{errMsg}</div>}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 rounded border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={goConfirm} className="px-5 py-2 rounded bg-brand text-white text-sm font-medium hover:opacity-90">Review →</button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="px-8 py-6">
            <div className="text-sm text-gray-600 mb-4">Confirm you want to create this task in the Content Calendar.</div>
            <div className="bg-gray-50 rounded-lg p-5 space-y-3">
              <Row label="Title" value={title} />
              <Row label="SBU" value={sbu || "—"} />
              <Row label="Type" value={type || "—"} />
              <Row label="Assign to" value={ownerLabel} />
              <Row label="Priority" value={priority} />
              <Row label="Publishing date" value={publishingDate || "—"} />
              <Row label="Due date" value={dueDate || "—"} />
              <Row label="Platforms" value={platforms.join(", ") || "—"} />
              {content && <Row label="Content brief" value={content.slice(0, 200) + (content.length > 200 ? "…" : "")} />}
              {caption && <Row label="Caption" value={caption.slice(0, 200) + (caption.length > 200 ? "…" : "")} />}
              {needsReview && <Row label="Needs review" value="Yes" />}
            </div>
            <div className="flex justify-end gap-3 pt-6">
              <button onClick={() => setStep("form")} className="px-4 py-2 rounded border border-gray-200 text-sm hover:bg-gray-50">← Back to edit</button>
              <button onClick={submit} className="px-5 py-2 rounded bg-brand text-white text-sm font-medium hover:opacity-90">Create task</button>
            </div>
          </div>
        )}

        {step === "saving" && (
          <div className="px-8 py-16 text-center">
            <div className="text-sm text-gray-500">Writing to Airtable…</div>
          </div>
        )}

        {step === "done" && (
          <div className="px-8 py-10">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-medium">Task created</div>
              <div className="text-sm text-gray-500 mt-1">
                Added to Content Calendar as <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{createdId}</code>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <button onClick={onClose} className="px-5 py-2 rounded border border-gray-200 text-sm hover:bg-gray-50">Close</button>
              <button
                onClick={() => {
                  setTitle(""); setSbu(""); setType(""); setOwner("");
                  setPublishingDate(""); setDueDate(""); setPriority("Medium");
                  setPlatforms([]); setContent(""); setCaption(""); setNeedsReview(false);
                  setCreatedId(null); setStep("form");
                }}
                className="px-5 py-2 rounded bg-brand text-white text-sm font-medium hover:opacity-90"
              >
                Create another
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="px-8 py-10">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠</div>
              <div className="text-lg font-medium">Task creation failed</div>
              <div className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{errMsg}</div>
            </div>
            <div className="flex justify-center gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded border border-gray-200 text-sm hover:bg-gray-50">Close</button>
              <button onClick={() => setStep("form")} className="px-5 py-2 rounded bg-brand text-white text-sm font-medium hover:opacity-90">Back to form</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
        {label}{required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <div className="w-32 text-gray-500 flex-shrink-0">{label}</div>
      <div className="flex-1 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
