"use client";

import { useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import {
  IconSparkles, IconCopy, IconCheck, IconPlus, IconTerminal2, IconDeviceDesktop,
  IconWorld, IconAlertTriangle, IconLock, IconPlugConnected,
} from "@tabler/icons-react";

// System → Connectors.
//
// Things outside the dashboard that are allowed to talk to it. Claude is the only one
// today, but it is built as a list because the next one — n8n, Zapier, a phone app —
// should slot in beside it rather than becoming a second page nobody finds.
//
// The setup lived on the Account page and only ever explained the terminal. Nikhil and
// Nandu do not use a terminal; they use the Claude desktop app, and there was nothing
// here telling them how. Hence one card per platform, written for somebody who has
// never set up a connector before.

type KeyState = { allowed: boolean; connected: boolean; createdAt?: string; lastUsedAt?: string };

export default function ConnectorsPage() {
  return (
    <PreviewDashboardShell active="connectors" title="Connectors" hideAccountPicker hideRange
      subtitle="Apps that are allowed to talk to this dashboard on your behalf.">
      {() => <Connectors />}
    </PreviewDashboardShell>
  );
}

function Connectors() {
  return (
    <div className="space-y-3">
      <ClaudeConnector />

      {/* The empty slot is the point of the page — it says more can go here, without
          pretending something is coming that nobody has agreed to build. */}
      <div className="bg-white border border-dashed border-[#D9DEEA] rounded-2xl p-5 flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#F6F7FB] text-[#A6ACBE] shrink-0">
          <IconPlus size={18} stroke={1.8} />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[#232D42]">Add another connector</div>
          <p className="text-[12.5px] text-[#8A92A6] mt-0.5">
            Nothing else is connected yet. Anything that should read or write this dashboard from
            outside — n8n, Zapier, another AI tool — gets set up here. Ask Praveen to add it.
          </p>
        </div>
      </div>
    </div>
  );
}

function ClaudeConnector() {
  const [st, setSt] = useState<KeyState | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<"desktop" | "web" | "terminal">("desktop");

  const load = () =>
    fetch("/api/account/claude-key", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json()).then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never";

  const create = async () => {
    setBusy(true);
    const r = await fetch("/api/account/claude-key", { method: "POST", credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setKey(j.key); load(); }
  };
  const disconnect = async () => {
    if (!(await confirmDialog({
      title: "Disconnect Claude?",
      body: "Claude will stop being able to read or change anything here until you create a new key.",
      action: "Disconnect", danger: true,
    }))) return;
    await fetch("/api/account/claude-key", { method: "DELETE", credentials: "same-origin" });
    setKey(null); load();
  };

  if (!st) return <Card><div className="text-[13px] text-[#8A92A6]">Loading…</div></Card>;
  if (!st.allowed) {
    return (
      <Card>
        <Head connected={false} />
        <div className="flex items-start gap-2 mt-1">
          <IconLock size={15} className="text-[#A6ACBE] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#8A92A6]">
            You don&apos;t have this turned on yet. Ask an admin to switch on
            <b className="font-medium text-[#4A5468]"> Connect Claude</b> for you on the Team page.
          </p>
        </div>
      </Card>
    );
  }

  // The key is shown once, at creation. After that we only know that one exists.
  const url = key ? `${origin}/api/mcp/${key}` : `${origin}/api/mcp/YOUR-KEY`;
  const cmd = key
    ? `claude mcp add --transport http --scope user goocampus ${origin}/api/mcp --header "Authorization: Bearer ${key}"`
    : `claude mcp add --transport http --scope user goocampus ${origin}/api/mcp --header "Authorization: Bearer YOUR-KEY"`;

  return (
    <Card>
      <Head connected={st.connected} />

      <p className="text-[13px] text-[#8A92A6] mb-3.5">
        Lets you work in Claude and have it act here. Research a story, write the copy, then say
        <i> &ldquo;put that on the board&rdquo;</i> — Claude creates the task as you, and asks which brand and
        which format if you haven&apos;t said. It can also read the board: <i>&ldquo;what&apos;s Manya
        working on&rdquo;</i>, <i>&ldquo;what&apos;s overdue&rdquo;</i>, <i>&ldquo;move that to Friday&rdquo;</i>.
      </p>

      {/* Step 1 — the key */}
      <Step n={1} title="Get your key">
        {key ? (
          <>
            <p className="text-[12.5px] text-[#C03221] mb-2 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              This is the only time you&apos;ll see it. Copy it now — if you lose it, make a new one.
            </p>
            <CopyBox value={key} />
          </>
        ) : st.connected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12.5px] text-[#8A92A6]">
              You already have one — created {when(st.createdAt)}, last used {when(st.lastUsedAt)}.
            </span>
            <button onClick={create} disabled={busy}
              className="ml-auto text-[12.5px] font-medium border border-gray-200 rounded-lg px-3 py-1.5 text-[#4A5468] hover:border-brand hover:text-brand disabled:opacity-50">
              {busy ? "Creating…" : "Make a new one"}
            </button>
            <button onClick={disconnect}
              className="text-[12.5px] text-[#8A92A6] hover:text-[#C03221] px-1">Disconnect</button>
          </div>
        ) : (
          <button onClick={create} disabled={busy}
            className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
            {busy ? "Creating…" : "Create my key"}
          </button>
        )}
        {st.connected && key && (
          <p className="text-[12px] text-[#A6ACBE] mt-1.5">Your previous key stopped working the moment this one was made.</p>
        )}
      </Step>

      {/* Step 2 — where you use Claude */}
      <Step n={2} title="Where do you use Claude?">
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {([
            ["desktop", "Claude app", IconDeviceDesktop],
            ["web", "claude.ai", IconWorld],
            ["terminal", "Claude Code", IconTerminal2],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setPlatform(k)}
              className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition ${
                platform === k ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-200 hover:border-brand hover:text-brand"}`}>
              <Icon size={14} stroke={1.8} /> {label}
            </button>
          ))}
        </div>

        {platform === "terminal" ? (
          <>
            <Num n="1">Open your terminal.</Num>
            <Num n="2">Paste this line and press Enter:</Num>
            <div className="ml-6 mb-2"><CopyBox value={cmd} mono /></div>
            <Num n="3">Restart Claude Code. Type <b className="font-medium text-[#4A5468]">/mcp</b> to check it says <i>goocampus</i>.</Num>
          </>
        ) : (
          <>
            <Num n="1">
              {platform === "desktop"
                ? "Open the Claude app and go to Settings → Connectors."
                : "Open claude.ai, click your name at the bottom left, then Settings → Connectors."}
            </Num>
            <Num n="2">Click <b className="font-medium text-[#4A5468]">Add custom connector</b>.</Num>
            <Num n="3">Name it <b className="font-medium text-[#4A5468]">GooCampus</b> and paste this as the URL:</Num>
            <div className="ml-6 mb-2"><CopyBox value={url} mono /></div>
            <Num n="4">
              Click Add. {key
                ? "Your key is already in that link — that's what signs you in."
                : "Replace YOUR-KEY with the key from step 1 — that's what signs you in."}
            </Num>
            <Num n="5">Start a new chat and ask <i>&ldquo;what&apos;s on the content board?&rdquo;</i> to check it worked.</Num>
          </>
        )}
      </Step>

      {/* Step 3 — what it can and can't do, so nobody has to find out */}
      <Step n={3} title="What Claude can and can't do" last>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <Can yes>Create a task on the board</Can>
          <Can yes>Read tasks, search them, see what&apos;s overdue</Can>
          <Can yes>Change status, dates, priority, owner and copy</Can>
          <Can yes>Read what Content Radar has found</Can>
          <Can>Delete anything — there is no such tool</Can>
          <Can>Move a task to a different brand</Can>
          <Can>Publish anything, anywhere</Can>
          <Can>See another person&apos;s key, or act as them</Can>
        </div>
        <p className="text-[12px] text-[#A6ACBE] mt-3">
          Everything Claude does here is recorded against your name in the task&apos;s activity, marked
          as coming from the connector. Your link is as good as your password — don&apos;t paste it in a
          group chat. If it ever leaks, come back here and make a new one; the old one dies instantly.
        </p>
      </Step>
    </Card>
  );
}

/* ---------------------------------------------------------------- bits */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-2xl p-5">{children}</div>;
}

function Head({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand-light text-brand shrink-0">
        <IconSparkles size={18} stroke={1.8} />
      </span>
      <div>
        <h2 className="text-[14.5px] font-semibold text-[#232D42]">Claude</h2>
        <p className="text-[11.5px] text-[#A6ACBE]">Anthropic · reads and writes the content board</p>
      </div>
      <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 ${
        connected ? "bg-[#E3F5EA] text-[#0F6E3C]" : "bg-[#F3F5F9] text-[#8A92A6]"}`}>
        <IconPlugConnected size={12} stroke={1.9} /> {connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex gap-3 pt-3.5 ${last ? "" : "pb-3.5 border-b border-[#F3F5F9]"}`}>
      <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-[11.5px] font-bold bg-brand-light text-[#2138B0] shrink-0 mt-0.5">{n}</span>
      <div className="flex-1 min-w-0">
        <h3 className="text-[13.5px] font-semibold text-[#232D42] mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Num({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-[#3B4457] mb-1.5 flex gap-2">
      <span className="text-[#A6ACBE] font-medium shrink-0">{n}.</span>
      <span>{children}</span>
    </p>
  );
}

function Can({ yes, children }: { yes?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[12.5px]">
      {yes
        ? <IconCheck size={14} stroke={2.2} className="text-[#0F6E3C] shrink-0 mt-0.5" />
        : <span className="text-[#C03221] font-bold shrink-0 mt-[-1px] w-[14px] text-center">×</span>}
      <span className={yes ? "text-[#3B4457]" : "text-[#8A92A6]"}>{children}</span>
    </div>
  );
}

function CopyBox({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* the text is selectable either way */ }
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className="flex items-start gap-2">
      <code className={`flex-1 min-w-0 break-all rounded-lg bg-[#F6F7FB] border border-gray-100 px-3 py-2 text-[12px] text-[#232D42] ${mono ? "font-mono" : ""}`}>
        {value}
      </code>
      <button onClick={copy}
        className={`h-9 px-3 rounded-lg border text-[12.5px] font-medium shrink-0 inline-flex items-center gap-1.5 transition ${
          copied ? "border-[#BFE6CD] bg-[#E3F5EA] text-[#0F6E3C]" : "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"}`}>
        {copied ? <IconCheck size={14} stroke={2} /> : <IconCopy size={14} stroke={1.8} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
