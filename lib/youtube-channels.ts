// YouTube channel registry. Lives in lib/ (not the route file) because a Next.js
// App-Router route.ts may only export request handlers — exporting CHANNELS from
// the route violated that and broke the typed-routes build. Imported by the
// youtube route + comments/uploads routes + lib/youtube.ts.
export const CHANNELS: Record<string, { id: string; name: string; handle: string; channelId: string }> = {
  goocampus:      { id: "goocampus",      name: "GooCampus",        handle: "@goocampus",       channelId: "" },
  goocampusworld: { id: "goocampusworld", name: "Study Abroad",     handle: "@goocampusstudyabroad", channelId: "" },
  twelfthplus:    { id: "twelfthplus",    name: "12thplus",         handle: "@12thplus",        channelId: "" },
  // Samvaya's new channel (Nandu, 26 Sept). Confirmed 8 Oct as "Samvaya Matrimony",
  // UCUdAtN5wd4x5NR9Pxmmnucw — not the similarly-named "@samvaya", which belongs to
  // somebody else. The handle stays BLANK until the channel sets one.
  //
  // Waiting on its own refresh token, NOT on a manager grant. An earlier note here
  // said one OAuth token serves every channel and the fix was to add the dashboard's
  // account as a manager in YouTube Studio. That was wrong, and the grant was made
  // on the strength of it and changed nothing. Crossing all three tokens against all
  // four channels gives a clean diagonal — each token reads its own channel and 403s
  // on every other, including the two GooCampus siblings that share an owner:
  //
  //                   GooCampus   12thPlus   Study Abroad   Samvaya
  //   goocampus              OK        403            403       403
  //   twelfthplus           401         OK            401       401
  //   goocampusworld        403        403             OK       403
  //
  // A refresh token is bound to the channel picked at Google's chooser during
  // consent, so no amount of granting makes an existing token reach a new channel.
  // Samvaya needs a fourth consent with Samvaya selected — see scripts/connect-youtube-channel.mjs.
  //
  // channelId stays "" until YOUTUBE_CHANNEL_IDS carries it, so the tab says
  // "not connected" rather than showing an error, which is the truer answer.
  samvaya:        { id: "samvaya",        name: "Samvaya",          handle: "",                 channelId: "" },
};

// Fill channelIds from env: YOUTUBE_CHANNEL_IDS = {"goocampus":"UCxxxx", ...}.
// Channels without an id stay on demo data.
try {
  const map = JSON.parse(process.env.YOUTUBE_CHANNEL_IDS || "{}") as Record<string, unknown>;
  for (const [k, v] of Object.entries(map)) {
    if (CHANNELS[k] && typeof v === "string") CHANNELS[k].channelId = v;
  }
} catch { /* malformed env → all channels stay demo */ }
