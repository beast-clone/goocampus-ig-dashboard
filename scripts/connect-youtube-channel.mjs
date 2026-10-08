// Connect one more YouTube channel to the dashboard.
//
//   node scripts/connect-youtube-channel.mjs samvaya UCUdAtN5wd4x5NR9Pxmmnucw
//
// Why this exists: a Google refresh token is bound to the channel picked at
// Google's chooser during consent. It is NOT bound to the person's access, so
// adding the dashboard's account as a manager in YouTube Studio does not let an
// existing token reach a new channel — crossing our three tokens against our four
// channels gives a clean diagonal, each reading only its own. Every channel
// therefore needs its own consent, and this walks through one.
//
// You sign in yourself; this only prints the link, catches what Google sends back,
// checks it, and writes it down. The token value is never printed.
import fs from "fs";
import http from "http";

const ENV = "D:/Claude/goocampus-ig-dashboard/.env.local";
const [key, channelId] = process.argv.slice(2);
if (!key || !channelId) {
  console.error("usage: node scripts/connect-youtube-channel.mjs <key> <channelId>");
  console.error("  e.g. node scripts/connect-youtube-channel.mjs samvaya UCUdAtN5wd4x5NR9Pxmmnucw");
  process.exit(1);
}

const env = fs.readFileSync(ENV, "utf8");
const g = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : null; };
const CLIENT_ID = g("YOUTUBE_CLIENT_ID"), CLIENT_SECRET = g("YOUTUBE_CLIENT_SECRET");
if (!CLIENT_ID || !CLIENT_SECRET) { console.error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing from .env.local"); process.exit(1); }

const PORT = Number(process.env.OAUTH_PORT || 5888);
const REDIRECT = `http://localhost:${PORT}/oauth-callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPES,
  access_type: "offline",   // ask for a refresh token, not just an hour's access
  prompt: "consent",        // force the chooser even if this account consented before
});

console.log(`\nConnecting "${key}" → ${channelId}\n`);
console.log("1. Open this link and sign in with the account that manages the channel:\n");
console.log("   " + authUrl + "\n");
console.log("2. Google will ask WHICH channel to use. Pick the right one — that choice,");
console.log("   not the account's permissions, is what the token ends up bound to.\n");
console.log(`waiting on ${REDIRECT} …`);
console.log("(if Google says redirect_uri_mismatch, add exactly that URL to the OAuth client");
console.log(" in Google Cloud Console → Credentials → Authorised redirect URIs)\n");

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (!u.pathname.startsWith("/oauth-callback")) { res.writeHead(404).end(); return; }
    const err = u.searchParams.get("error"), c = u.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<body style="font:16px system-ui;padding:3rem;max-width:34rem"><h2>${c ? "Done" : "Cancelled"}</h2><p>${c ? "You can close this tab and go back to the terminal." : "Nothing was changed."}</p></body>`);
    server.close();
    c ? resolve(c) : reject(new Error(err || "no code returned"));
  });
  server.listen(PORT);
  setTimeout(() => { server.close(); reject(new Error("timed out after 5 minutes")); }, 300_000);
});

// ── exchange ────────────────────────────────────────────────────────────────
const tok = await (await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
})).json();
if (!tok.refresh_token) {
  console.error("\nGoogle returned no refresh token" + (tok.error_description ? ` — ${tok.error_description}` : "") + ".");
  console.error("That usually means this account already consented; prompt=consent should prevent it,");
  console.error("but you can also revoke the app at myaccount.google.com/permissions and retry.");
  process.exit(1);
}

// ── check it before writing it down ─────────────────────────────────────────
// A token that cannot read the channel is worse than none: it would look connected
// and report nothing. So prove the read first, and refuse to save otherwise.
const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
const H = { Authorization: `Bearer ${tok.access_token}` };
const a = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3D${channelId}&startDate=${from}&endDate=${today}&metrics=views`, { headers: H });
if (!a.ok) {
  const e = await a.json().catch(() => ({}));
  console.error(`\nThis token still cannot read ${channelId} (HTTP ${a.status}${e.error?.message ? " — " + e.error.message : ""}).`);
  console.error("Most likely a different channel was picked at the chooser. Nothing was saved — run it again.");
  process.exit(1);
}
const views = (await a.json()).rows?.[0]?.[0] ?? 0;
const ch = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}`, { headers: H })).json();
const title = ch.items?.[0]?.snippet?.title || "(unknown)";
console.log(`\nreads "${title}" — ${views} views in the last 28 days`);

// ── write it down ───────────────────────────────────────────────────────────
// Rewrites the two JSON maps in place. The token itself is never printed.
const setMap = (text, name, k, v) => {
  const re = new RegExp("^" + name + "=(.*)$", "m");
  const m = text.match(re);
  const map = m ? JSON.parse(m[1].trim().replace(/^["']|["']$/g, "")) : {};
  map[k] = v;
  const line = name + "=" + JSON.stringify(map);
  return m ? text.replace(re, line) : text.trimEnd() + (text.includes("\r\n") ? "\r\n" : "\n") + line + "\n";
};
let out = fs.readFileSync(ENV, "utf8");
out = setMap(out, "YOUTUBE_REFRESH_TOKENS", key, tok.refresh_token);
out = setMap(out, "YOUTUBE_CHANNEL_IDS", key, channelId);
fs.writeFileSync(ENV, out);

console.log(`saved to .env.local — YOUTUBE_REFRESH_TOKENS["${key}"] and YOUTUBE_CHANNEL_IDS["${key}"]`);
console.log("\nRestart the dev server to pick it up. For the live site, the same two values");
console.log("have to be set on Netlify, which needs a deploy — ask first.");
