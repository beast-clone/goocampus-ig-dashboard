"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import type { JSONContent } from "@tiptap/core";
import { IconBold, IconItalic, IconStrikethrough, IconH3, IconList, IconListNumbers, IconListCheck, IconQuote, IconMinus, IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react";
import { sanitizeRichText } from "@/lib/sanitize-rich-text";

// An always-editable text box for a task's Content and Caption — the Airtable way:
// click and type, no Edit / Save buttons, formatting shown as you write (Manya,
// 10 Oct: "remove both edit and save button", "the option of heading, bold,
// italics", "dash and enter … bullet points", "pasted bullets stay intact").
//
// The stored text stays exactly what it was: one line per line, `### ` headings,
// `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `- ` bullets, `1. ` numbers,
// `- [ ] ` checklists, `> ` quotes, `---` lines, `[text](url)` links.
//
// The usual editor shortcuts work, as in Airtable or Google Docs (Praveen, 21 Oct):
// typing `# `, `- `, `1. `, `[] `, `> `, `---`, `**b**`, `*i*`, `~~s~~`, `` `c` ``
// formats as you go; Cmd/Ctrl + B / I / Shift+S / Shift+7 / Shift+8 / Shift+9 / Z. That is
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

export function RichTextField({ value, onSave, mode = "rich", placeholder, maxHeight }: {
  value: string;
  /** Cap a long text at this height (px) with its own scroll and a "Show all" toggle,
   *  so what sits below it — Creatives & files — isn't buried 3 screens down
   *  (Praveen, 21 Oct). */
  maxHeight?: number;
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
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
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
        : { heading: { levels: [1, 2, 3] }, codeBlock: false, underline: false,
            link: { openOnClick: true, autolink: true, linkOnPaste: true } }),
      ...(mode === "rich" ? [TaskList, TaskItem.configure({ nested: true })] : []),
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
      // Pasted lists keep their bullets wherever they come from (Manya, 21 Oct). Google
      // Docs and web pages send real lists; Word sends paragraphs that only LOOK like
      // bullets, and WhatsApp / Notes / plain text send "• item" lines — both became
      // loose paragraphs. Turn those into real lists, and drop a pasted list in place
      // of the empty line it lands on instead of merging its first point into it.
      transformPastedHTML: (html) => (mode === "rich" ? listifyPastedHtml(html) : html),
      handlePaste: (view, event) => {
        if (mode !== "rich") return false;
        const cd = event.clipboardData;
        if (!cd || cd.files.length) return false;
        const rawHtml = cd.getData("text/html");
        const text = cd.getData("text/plain");
        let html = "";
        if (rawHtml) { const h = listifyPastedHtml(rawHtml); if (/<(ul|ol)\b/i.test(h)) html = h; }
        else if (text && text.split(/\r?\n/).some((l) => BULLET.test(l) || NUMBER.test(l) || TASK.test(l))) html = toHtml(text, "rich");
        if (!html) return false;
        const ed = editorRef.current;
        if (!ed) return false;
        const { $from, empty } = view.state.selection;
        const blank = empty && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth === 1;
        if (blank) ed.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, html).run();
        else ed.chain().focus().insertContent(html).run();
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

  // Does the text run past the cap? Re-checked as it changes.
  useEffect(() => {
    if (!maxHeight) return;
    const el = boxRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > maxHeight + 4);
    check();
    const ro = new ResizeObserver(check);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [maxHeight, editor]);

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
          {btn("Strikethrough (Ctrl/Cmd+Shift+S)", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), IconStrikethrough)}
          <span className="gc-rtf-sep" />
          {btn("Bullets (Ctrl/Cmd+Shift+8) — or type - and press Enter", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), IconList)}
          {btn("Numbered list (Ctrl/Cmd+Shift+7)", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), IconListNumbers)}
          {btn("Checklist (Ctrl/Cmd+Shift+9) — or type [] and a space", editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), IconListCheck)}
          {btn("Quote — or type > and a space", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), IconQuote)}
          {btn("Line — or type ---", false, () => editor.chain().focus().setHorizontalRule().run(), IconMinus)}
          <span className="gc-rtf-sep" />
          {btn("Undo (Ctrl/Cmd+Z)", false, () => editor.chain().focus().undo().run(), IconArrowBackUp)}
          {btn("Redo (Ctrl/Cmd+Shift+Z)", false, () => editor.chain().focus().redo().run(), IconArrowForwardUp)}
          <span className="gc-rtf-state">{STATE_LABEL[state]}</span>
        </div>
      )}
      <div className="gc-rtf-wrap" ref={boxRef}
        style={maxHeight && !expanded ? { maxHeight, overflowY: "auto", overflowX: "hidden", paddingLeft: 8, paddingRight: 8 } : undefined}>
        <EditorContent editor={editor} />
        {editor && editor.isEmpty && !editor.isFocused && placeholder && <div className="gc-rtf-ph">{placeholder}</div>}
      </div>
      {maxHeight && (overflows || expanded) && (
        <button type="button" className="gc-rtf-more" onClick={() => setExpanded((x) => !x)}>
          {expanded ? "Show less" : "Show full text"}
        </button>
      )}
      {mode === "plain" && state !== "idle" && <div className="gc-rtf-state below">{STATE_LABEL[state]}</div>}
    </div>
  );
}

const STATE_LABEL: Record<string, string> = { idle: "", dirty: "Editing…", saving: "Saving…", saved: "Saved", error: "Couldn't save — click in and out to retry" };

// ── stored text → editor HTML ────────────────────────────────────────────────

const LOOKS_LIKE_HTML = /<(p|div|br|ul|ol|li|h[1-6]|strong|em|b|i|a|table|span)\b[^>]*>/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline marks, one pass so a URL inside **bold** or a link's own text is handled once.
const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*?[^*\s])?)\*|~~(.+?)~~|`([^`]+)`/g;
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
    else if (m[6] !== undefined) out += `<s>${inline(m[6], plain)}</s>`;
    else if (m[7] !== undefined) out += `<code>${esc(m[7])}</code>`;
    last = i + m[0].length;
  }
  return out + esc(s.slice(last));
}

const BULLET = /^(\s*)[-*+•◦▪·–]\s+(.*)$/;
const NUMBER = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const TASK = /^(\s*)[-*+•]?\s*\[( |x|X)?\]\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^>\s?(.*)$/;

function toHtml(value: string, mode: Mode): string {
  const v = value || "";
  if (LOOKS_LIKE_HTML.test(v)) return sanitizeRichText(v);
  const plain = mode === "plain";
  const out: string[] = [];
  let list: "ul" | "ol" | "task" | "quote" | null = null;
  const close = () => { if (list) { out.push(list === "task" ? "</ul>" : list === "quote" ? "</blockquote>" : `</${list}>`); list = null; } };
  const open = (want: "ul" | "ol" | "task" | "quote") => {
    if (list === want) return;
    close();
    out.push(want === "task" ? `<ul data-type="taskList">` : want === "quote" ? "<blockquote>" : `<${want}>`);
    list = want;
  };
  for (const line of v.replace(/\r\n?/g, "\n").split("\n")) {
    if (!plain) {
      const t = line.match(TASK);
      if (t) { open("task"); out.push(`<li data-type="taskItem" data-checked="${/x/i.test(t[2] || "")}"><p>${inline(t[3], plain)}</p></li>`); continue; }
      if (RULE.test(line)) { close(); out.push("<hr>"); continue; }
      const q = line.match(QUOTE);
      if (q) { open("quote"); out.push(`<p>${inline(q[1], plain)}</p>`); continue; }
    }
    const b = plain ? null : line.match(BULLET);
    const n = plain || b ? null : line.match(NUMBER);
    const h = plain || b || n ? null : line.match(HEADING);
    if (b || n) {
      open(b ? "ul" : "ol");
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

// ── pasted HTML → real lists ─────────────────────────────────────────────────
// Word marks a list item as a paragraph with "mso-list" and a fake bullet in an
// "mso-list:Ignore" span; other apps paste "• item" paragraphs. Both become <ul>/<ol>.
// Typed markers only — Word's own ("o", "§" in Symbol/Wingdings) are removed with
// their mso-list:Ignore span, so a paragraph that starts with the word "o" is safe.
const FAKE_BULLET = /^\s*([•◦▪·\-–*]|\d+[.)])\s+/;
function listifyPastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.body.querySelectorAll("p, div")).filter((el) => !el.closest("li") && !el.querySelector("p, div, ul, ol"));
  let group: HTMLElement | null = null, prev: Element | null = null;
  for (const el of blocks) {
    const word = /mso-list/i.test(el.getAttribute("style") || "") || /MsoList/i.test(el.className);
    let ordered = false;
    if (word) {
      const marker = el.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
      ordered = /^\s*\d+[.)]/.test(marker?.textContent || "");
      marker?.remove();
    } else {
      const m = (el.textContent || "").match(FAKE_BULLET);
      if (!m) { group = null; prev = el; continue; }
      ordered = /\d/.test(m[1]);
      // strip the typed marker from the first text node
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let tn = walker.nextNode();
      while (tn && !(tn.textContent || "").trim()) tn = walker.nextNode();
      if (tn) tn.textContent = (tn.textContent || "").replace(FAKE_BULLET, "");
    }
    const tag = ordered ? "OL" : "UL";
    if (!group || group.tagName !== tag || prev?.nextElementSibling !== el) {
      group = doc.createElement(tag);
      el.parentNode?.insertBefore(group, el);
    }
    const li = doc.createElement("li"), p = doc.createElement("p");
    p.innerHTML = el.innerHTML.replace(/^(\s|&nbsp;)+/, "");
    li.appendChild(p); group.appendChild(li); el.remove();
    prev = group;
  }
  return doc.body.innerHTML;
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
    const strike = marks.some((m) => m.type === "strike");
    const code = marks.some((m) => m.type === "code");
    // Keep a mark's spaces outside it — "** word**" stops being bold when read back.
    const lead = t.match(/^\s*/)?.[0] || "", trail = t.match(/\s*$/)?.[0] || "";
    let core = t.slice(lead.length, t.length - trail.length);
    if (core) {
      if (code) core = `\`${core}\``;
      if (strike) core = `~~${core}~~`;
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
    case "horizontalRule": lines.push("---"); break;
    case "blockquote": {
      const inner: string[] = [];
      for (const c of n.content || []) block(c, plain, 0, inner);
      for (const l of inner) lines.push(`> ${l}`);
      break;
    }
    case "taskList":
      for (const li of n.content || []) {
        const [first, ...rest] = li.content || [];
        lines.push(`${pad}- [${li.attrs?.checked ? "x" : " "}] ${first ? marksText(first.content, plain) : ""}`);
        for (const r of rest) block(r, plain, depth + 1, lines);
      }
      break;
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
/* Toolbar as one soft bar in the dashboard theme (Praveen, 22 Oct) */
.gc-rtf-bar{display:flex;align-items:center;gap:2px;margin:0 0 10px;padding:4px;background:#F6F7FB;border:1px solid #EEF0F4;border-radius:10px;flex-wrap:wrap}
.gc-rtf-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;border:1px solid transparent;background:none;color:#4A5468;cursor:pointer}
.gc-rtf-btn:hover{background:#fff;border-color:#E6E9F2;color:#232D42}
.gc-rtf-btn.on{background:#fff;border-color:#D5DBF8;color:#3A57E8}
.gc-rtf-sep{width:1px;height:18px;background:#E1E4EC;margin:0 5px}
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
.gc-rtf-body hr{border:0;border-top:1px solid #E6E9F2;margin:10px 0}
.gc-rtf-body hr.ProseMirror-selectednode{border-top-color:#3A57E8}
.gc-rtf-body blockquote{border-left:3px solid #E9ECFB;padding-left:10px;margin:4px 0;color:#4A5468}
.gc-rtf-body code{background:#F6F7FB;border-radius:4px;padding:1px 4px;font-size:13px}
.gc-rtf-body s{color:#8A92A6}
.gc-rtf-body ul[data-type="taskList"]{list-style:none;padding-left:2px}
.gc-rtf-body ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:8px}
.gc-rtf-body ul[data-type="taskList"] li > label{margin-top:3px;flex-shrink:0}
.gc-rtf-body ul[data-type="taskList"] li > label input{accent-color:#3A57E8;cursor:pointer}
.gc-rtf-body ul[data-type="taskList"] li > div{flex:1;min-width:0}
.gc-rtf-body ul[data-type="taskList"] li[data-checked="true"] > div{color:#8A92A6;text-decoration:line-through}
.gc-rtf-body.ProseMirror-focused{border-color:#3A57E8}
.gc-rtf-wrap{position:relative}
.gc-rtf-more{margin-top:6px;border:0;background:none;padding:0;font-size:12.5px;font-weight:500;color:#3A57E8;cursor:pointer}
.gc-rtf-more:hover{text-decoration:underline}
.gc-rtf-ph{position:absolute;top:7px;left:0;font-size:14px;line-height:22px;color:#8A92A6;pointer-events:none}
html[data-theme="dark"] .gc-rtf-body{color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-body h1,html[data-theme="dark"] .gc-rtf-body h2,html[data-theme="dark"] .gc-rtf-body h3,html[data-theme="dark"] .gc-rtf-body strong{color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-btn:hover{background:var(--d-raised);color:var(--d-ink)}
html[data-theme="dark"] .gc-rtf-body:hover{border-color:var(--d-line)}
`;
