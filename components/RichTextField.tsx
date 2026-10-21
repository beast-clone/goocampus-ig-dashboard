"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { IconBold, IconItalic, IconH3, IconList, IconListNumbers } from "@tabler/icons-react";
import { sanitizeRichText } from "@/lib/sanitize-rich-text";

// An always-editable text box for a task's Content and Caption — the Airtable way:
// click and type, no Edit / Save buttons, formatting shown as you write (Manya,
// 10 Oct: "remove both edit and save button", "the option of heading, bold,
// italics", "dash and enter … bullet points", "pasted bullets stay intact").
//
// The stored text stays exactly what it was: one line per line, `### ` headings,
// `**bold**`, `*italic*`, `- ` bullets, `1. ` numbers, `[text](url)` links. That is
// what Airtable sends, what the renderer in components/Markdown.tsx reads and what
// the Scheduler passes on, so the editor converts to and from it itself rather than
// re-flowing everything through a Markdown library (which would merge single lines
// into paragraphs and change every task the first time anyone touched it).
//
// "plain" (the Caption) keeps only lines and links: a caption is published as-is,
// so it must never pick up ** or ###.
//
// Saving: on leaving the box, after a pause in typing, and when the window closes —
// never per keystroke, because every save is also an entry in the task's Activity.

type Mode = "rich" | "plain";
const IDLE_SAVE_MS = 8000;

export function RichTextField({ value, onSave, mode = "rich", placeholder }: {
  value: string;
  /** Persist the new text. Resolve when saved; throw to keep the text marked unsaved. */
  onSave: (next: string) => Promise<void>;
  mode?: Mode;
  placeholder?: string;
}) {
  const saved = useRef(value);           // what the server has
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const editorRef = useRef<Editor | null>(null);
  // Only a real edit saves. Reading old text in can tidy it (a stray "###" line, a
  // mark with spaces inside it), and merely clicking in and out must not write
  // that tidied copy back over the task.
  const touched = useRef(false);

  const flush = async (editor: Editor | null) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!editor || editor.isDestroyed || !touched.current) return;
    const next = serialize(editor.getJSON(), mode);
    if (next === saved.current) { setState((s) => (s === "dirty" ? "idle" : s)); return; }
    setState("saving");
    try {
      await onSaveRef.current(next);
      saved.current = next;
      touched.current = false;
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const editor = useEditor({
    immediatelyRender: false,   // Next renders on the server first; let the browser build it
    extensions: [
      StarterKit.configure(mode === "plain"
        ? { heading: false, bold: false, italic: false, strike: false, underline: false, code: false, codeBlock: false,
            blockquote: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
            link: { openOnClick: true, autolink: true, linkOnPaste: true } }
        : { heading: { levels: [1, 2, 3] }, code: false, codeBlock: false, blockquote: false, horizontalRule: false, strike: false, underline: false,
            link: { openOnClick: true, autolink: true, linkOnPaste: true } }),
    ],
    content: toHtml(value, mode),
    editorProps: {
      attributes: { class: `gc-rtf-body ${mode === "plain" ? "is-plain" : ""}` },
      // "-" then Enter turns the line into a bullet, as Airtable does. ("- " then
      // typing already does, through the list's own input rule.)
      handleKeyDown: (view, event) => {
        if (mode !== "rich" || event.key !== "Enter" || event.shiftKey) return false;
        const { $from } = view.state.selection;
        if ($from.parent.type.name !== "paragraph" || $from.parent.textContent.trim() !== "-") return false;
        const ed = editorRef.current;
        if (!ed) return false;
        ed.chain().deleteRange({ from: $from.start(), to: $from.end() }).toggleBulletList().run();
        return true;
      },
    },
    onUpdate: () => {
      touched.current = true;
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(editorRef.current), IDLE_SAVE_MS);
    },
    onBlur: () => { flush(editorRef.current); },
  });
  editorRef.current = editor;

  // A fresh value from the server (another task opened, or a save elsewhere) —
  // take it, unless the person is mid-edit here.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === saved.current) return;
    if (editor.isFocused && state === "dirty") return;
    saved.current = value;
    touched.current = false;
    editor.commands.setContent(toHtml(value, mode), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Closing the window must not lose what was typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { flush(editorRef.current); }, []);

  const btn = (label: string, active: boolean, run: () => void, Icon: typeof IconBold) => (
    <button type="button" title={label} aria-label={label} aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); run(); }}
      className={`gc-rtf-btn ${active ? "on" : ""}`}><Icon size={15} stroke={1.8} /></button>
  );

  return (
    <div className="gc-rtf">
      <style dangerouslySetInnerHTML={{ __html: RTF_CSS }} />
      {mode === "rich" && editor && (
        <div className="gc-rtf-bar">
          {btn("Heading", editor.isActive("heading"), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), IconH3)}
          {btn("Bold (Ctrl/Cmd+B)", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), IconBold)}
          {btn("Italic (Ctrl/Cmd+I)", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), IconItalic)}
          <span className="gc-rtf-sep" />
          {btn("Bullets — or type - and press Enter", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), IconList)}
          {btn("Numbered list", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), IconListNumbers)}
          <span className="gc-rtf-state">{STATE_LABEL[state]}</span>
        </div>
      )}
      <div className="gc-rtf-wrap">
        <EditorContent editor={editor} />
        {editor && editor.isEmpty && !editor.isFocused && placeholder && <div className="gc-rtf-ph">{placeholder}</div>}
      </div>
      {mode === "plain" && state !== "idle" && <div className="gc-rtf-state below">{STATE_LABEL[state]}</div>}
    </div>
  );
}

const STATE_LABEL: Record<string, string> = { idle: "", dirty: "Editing…", saving: "Saving…", saved: "Saved", error: "Couldn't save — click in and out to retry" };

// ── stored text → editor HTML ────────────────────────────────────────────────

const LOOKS_LIKE_HTML = /<(p|div|br|ul|ol|li|h[1-6]|strong|em|b|i|a|table|span)\b[^>]*>/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline marks, one pass so a URL inside **bold** or a link's own text is handled once.
const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*?[^*\s])?)\*/g;
function inline(s: string, plain: boolean): string {
  let out = "", last = 0;
  for (const m of s.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (plain && !m[2] && !m[3]) continue;   // a caption keeps its asterisks as typed
    out += esc(s.slice(last, i));
    if (m[2]) out += plain ? esc(m[0]) : `<a href="${esc(m[2])}">${inline(m[1], plain)}</a>`;
    else if (m[3]) out += `<a href="${esc(m[3])}">${esc(m[3])}</a>`;
    else if (m[4] !== undefined) out += `<strong>${inline(m[4], plain)}</strong>`;
    else if (m[5] !== undefined) out += `<em>${inline(m[5], plain)}</em>`;
    last = i + m[0].length;
  }
  return out + esc(s.slice(last));
}

const BULLET = /^(\s*)[-*+•◦▪–]\s+(.*)$/;
const NUMBER = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

function toHtml(value: string, mode: Mode): string {
  const v = value || "";
  if (LOOKS_LIKE_HTML.test(v)) return sanitizeRichText(v);
  const plain = mode === "plain";
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of v.replace(/\r\n?/g, "\n").split("\n")) {
    const b = plain ? null : line.match(BULLET);
    const n = plain || b ? null : line.match(NUMBER);
    const h = plain || b || n ? null : line.match(HEADING);
    if (b || n) {
      const want = b ? "ul" : "ol";
      if (list !== want) { close(); out.push(`<${want}>`); list = want; }
      out.push(`<li><p>${inline((b || n)![2], plain)}</p></li>`);
      continue;
    }
    close();
    if (h) { const lvl = Math.min(3, h[1].length); out.push(`<h${lvl}>${inline(h[2].replace(/\s*#+\s*$/, ""), plain)}</h${lvl}>`); }
    else out.push(`<p>${inline(line, plain)}</p>`);
  }
  close();
  return out.join("");
}

// ── editor JSON → stored text ────────────────────────────────────────────────

function marksText(nodes: JSONContent[] | undefined, plain: boolean): string {
  let s = "";
  for (const n of nodes || []) {
    if (n.type === "hardBreak") { s += "\n"; continue; }
    if (n.type !== "text") continue;
    let t = n.text || "";
    if (plain) { s += t; continue; }
    const marks = n.marks || [];
    const link = marks.find((m) => m.type === "link");
    const bold = marks.some((m) => m.type === "bold");
    const italic = marks.some((m) => m.type === "italic");
    // Keep a mark's spaces outside it — "** word**" stops being bold when read back.
    const lead = t.match(/^\s*/)?.[0] || "", trail = t.match(/\s*$/)?.[0] || "";
    let core = t.slice(lead.length, t.length - trail.length);
    if (core) {
      if (italic) core = `*${core}*`;
      if (bold) core = `**${core}**`;
      if (link) { const href = String(link.attrs?.href || ""); core = core === href ? href : `[${core}](${href})`; }
    }
    t = lead + core + trail;
    s += t;
  }
  return s;
}

function block(n: JSONContent, plain: boolean, depth: number, lines: string[]) {
  const pad = "  ".repeat(depth);
  switch (n.type) {
    case "paragraph": lines.push(pad + marksText(n.content, plain)); break;
    case "heading": lines.push(`${"#".repeat(Number(n.attrs?.level) || 3)} ${marksText(n.content, plain)}`); break;
    case "bulletList":
    case "orderedList": {
      let i = Number(n.attrs?.start) || 1;
      for (const li of n.content || []) {
        const [first, ...rest] = li.content || [];
        const marker = n.type === "bulletList" ? "- " : `${i++}. `;
        lines.push(pad + marker + (first ? marksText(first.content, plain) : ""));
        for (const r of rest) block(r, plain, depth + 1, lines);
      }
      break;
    }
    default:
      if (n.content) for (const c of n.content) block(c, plain, depth, lines);
  }
}

function serialize(doc: JSONContent, mode: Mode): string {
  const lines: string[] = [];
  for (const n of doc.content || []) block(n, mode === "plain", 0, lines);
  return lines.join("\n").replace(/\s+$/, "");
}

const RTF_CSS = `
.gc-rtf{position:relative}
.gc-rtf-bar{display:flex;align-items:center;gap:2px;margin:-2px 0 6px}
.gc-rtf-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;border-radius:6px;border:0;background:none;color:#8A92A6;cursor:pointer}
.gc-rtf-btn:hover{background:#F6F7FB;color:#232D42}
.gc-rtf-btn.on{background:#E9ECFB;color:#3A57E8}
.gc-rtf-sep{width:1px;height:16px;background:#E6E9F2;margin:0 4px}
.gc-rtf-state{margin-left:auto;font-size:11px;color:#8A92A6}
.gc-rtf-state.below{margin-top:4px;text-align:right}
.gc-rtf-body{outline:none;min-height:44px;font-size:14px;line-height:22px;color:#1D1F25;border:1px solid transparent;border-radius:8px;padding:6px 8px;margin:0 -8px;white-space:pre-wrap;word-break:break-word}
.gc-rtf-body:hover{border-color:#F1F3F8}
.gc-rtf-body:focus{border-color:#3A57E8}
.gc-rtf-body p{margin:0;min-height:22px}
.gc-rtf-body h1,.gc-rtf-body h2,.gc-rtf-body h3{font-weight:500;color:#232D42;margin:8px 0 2px}
.gc-rtf-body h1{font-size:18px;line-height:26px}.gc-rtf-body h2{font-size:16px;line-height:24px}.gc-rtf-body h3{font-size:15px;line-height:22px}
.gc-rtf-body strong{font-weight:500;color:#232D42}
.gc-rtf-body ul{list-style:disc;padding-left:22px;margin:2px 0}
.gc-rtf-body ol{list-style:decimal;padding-left:22px;margin:2px 0}
.gc-rtf-body li p{margin:0}
.gc-rtf-body a{color:#3A57E8;text-decoration:underline;cursor:pointer;word-break:break-all}
.gc-rtf-body.ProseMirror-focused{border-color:#3A57E8}
.gc-rtf-wrap{position:relative}
.gc-rtf-ph{position:absolute;top:7px;left:0;font-size:14px;line-height:22px;color:#8A92A6;pointer-events:none}
html[data-theme="dark"] .gc-rtf-body{color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-body h1,html[data-theme="dark"] .gc-rtf-body h2,html[data-theme="dark"] .gc-rtf-body h3,html[data-theme="dark"] .gc-rtf-body strong{color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-btn:hover{background:var(--d-raised);color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-body:hover{border-color:var(--d-line)}
`;
