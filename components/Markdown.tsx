"use client";

import type { ReactNode } from "react";

// The one Markdown renderer.
//
// Lived inside MarketingHub until the review queue turned out to need it too —
// its cards were printing "**Slide 1**" at people. Two copies of a parser is two
// sets of edge cases, so there is one, here.
//
// Markdown, rendered.
//
// "Remove all the astrics and hashtag symbol, it's looking clumpsy" and "give the
// option of italics, bold, H3 same like airtable so that the references and other
// similar things appear as big heading" (Manya, 5 Oct).
//
// Half the content in the board is written in Markdown — "### Thumbnail text",
// "**bold**" — and none of it is HTML, so it was being printed literally, symbols
// and all. The hashes and asterisks were never decoration to strip; they were
// formatting nobody was applying.
//
// Built by hand into React elements rather than pulling in a Markdown library and
// setting innerHTML: the set the team actually writes is small, and this way no
// string from the database is ever interpreted as HTML.
const MD_HEADING = /^(#{1,6})\s+(.*)$/;
const MD_BULLET = /^\s*[-*+]\s+(.*)$/;
const MD_NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
// bold | italic | code | [text](url)
//
// Italic is *stars only*, never _underscores_. A tracking URL like
// ...?utm_source=igweb has two underscores in it, and treating those as emphasis
// swallowed them and italicised the link — the text came out as "utmsource=igweb".
// Mangling a link people have to copy is far worse than not rendering _italics_,
// which nobody here writes anyway.
const MD_INLINE = /(\*\*|__)(.+?)\1|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function inlineMd(text: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  MD_INLINE.lastIndex = 0;
  while ((m = MD_INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={`${k}b${i}`} className="font-semibold text-[#2B3445]">{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={`${k}i${i}`}>{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<code key={`${k}c${i}`} className="rounded bg-gray-100 px-1 py-0.5 text-[13px]">{m[4]}</code>);
    else out.push(<a key={`${k}a${i}`} href={m[6]} target="_blank" rel="noreferrer" className="text-brand underline break-all">{m[5]}</a>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ value }: { value: string }) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (!para.length) return;
    const key = `p${out.length}`;
    out.push(<p key={key} className="whitespace-pre-wrap">{inlineMd(para.join("\n"), key)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const key = `l${out.length}`;
    const items = list.items.map((it, n) => <li key={`${key}i${n}`}>{inlineMd(it, `${key}i${n}`)}</li>);
    out.push(list.ordered
      ? <ol key={key} className="list-decimal pl-5 space-y-1">{items}</ol>
      : <ul key={key} className="list-disc pl-5 space-y-1">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = MD_HEADING.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      const key = `h${out.length}`;
      // Headings have to look like headings — that is the whole point of the ask.
      const cls = level <= 2
        ? "text-[16px] font-bold text-[#232D42] mt-1"
        : level === 3 ? "text-[15px] font-semibold text-[#2B3445] mt-1"
        : "text-[14px] font-semibold text-[#2B3445]";
      out.push(<div key={key} className={cls}>{inlineMd(h[2], key)}</div>);
      continue;
    }
    const b = MD_BULLET.exec(line);
    const n = MD_NUMBER.exec(line);
    if (b || n) {
      flushPara();
      const ordered = !!n;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(ordered ? n![2] : b![1]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();

  return <div className="text-[14px] leading-[22px] text-[#5A6478] space-y-3">{out}</div>;
}

/**
 * The same text with the marks taken off, for places that show a SNIPPET.
 *
 * A two-line preview clamped mid-sentence is not improved by bold runs and
 * half-rendered headings; it just needs to read as words. This is only ever for
 * display — never feed it back into anything that saves.
 */
export function plainText(md: string | null | undefined): string {
  return String(md || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")          // headings
    .replace(/^\s*[-*+]\s+/gm, "")               // bullets
    .replace(/^\s*\d+[.)]\s+/gm, "")             // numbered lists
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")    // [text](url) -> text
    .replace(/(\*\*|__)(.+?)\1/g, "$2")          // bold
    .replace(/\*([^*\n]+)\*/g, "$1")             // italic
    .replace(/`([^`]+)`/g, "$1")                // code
    .replace(/\n{2,}/g, " · ")                   // paragraph breaks, inline
    .replace(/\s+/g, " ")
    .trim();
}

