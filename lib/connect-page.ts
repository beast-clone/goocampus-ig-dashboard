import { NextResponse } from "next/server";

// The one page a channel owner sees after opening a connect link (they have no
// dashboard login, so they can't be sent into the dashboard). Plain, on-brand, no scripts.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function connectPage(ok: boolean, text: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GooCampus dashboard</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F7FB;font:400 15px/1.55 Inter,system-ui,sans-serif;color:#232D42;padding:16px}
.c{background:#fff;border:1px solid #EEF0F5;border-radius:16px;padding:32px 28px;max-width:440px;width:100%;text-align:center}
.i{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:${ok ? "#E3F5EA" : "#FDECEC"};color:${ok ? "#1AA053" : "#C0201F"}}
h1{font-size:19px;font-weight:500;margin:0 0 6px}p{margin:0;color:#8A92A6}</style></head>
<body><div class="c"><div class="i"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ok ? '<path d="M5 12l5 5l10 -10"/>' : '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>'}</svg></div>
<h1>${ok ? "Connected" : "Not connected"}</h1><p>${esc(text)}</p></div></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
