// YouTube channel registry. Lives in lib/ (not the route file) because a Next.js
// App-Router route.ts may only export request handlers — exporting CHANNELS from
// the route violated that and broke the typed-routes build. Imported by the
// youtube route + comments/uploads routes + lib/youtube.ts.
export const CHANNELS: Record<string, { id: string; name: string; handle: string; channelId: string }> = {
  goocampus:      { id: "goocampus",      name: "GooCampus",        handle: "@goocampus",       channelId: "" },
  goocampusworld: { id: "goocampusworld", name: "Study Abroad",     handle: "@goocampusstudyabroad", channelId: "" },
  twelfthplus:    { id: "twelfthplus",    name: "12thplus",         handle: "@12thplus",        channelId: "" },
  // Samvaya's new channel (Nandu, 26 Sept). Its handle is deliberately BLANK.
  //
  // Searching YouTube turns up more than one plausible Samvaya — "@samvaya" and a
  // "Samvaya Matrimony" — and picking the wrong one would point the tab at a
  // stranger's channel and report their numbers as ours. So this waits for the id
  // to be given in YOUTUBE_CHANNEL_IDS rather than guessing from a name; with no
  // id it answers "not connected", which is true.
  //
  // The account behind YOUTUBE_REFRESH_TOKEN also has to MANAGE the channel. It
  // does not today: both candidates answer 403 to the analytics call while
  // GooCampus answers 200 on the same token. One OAuth token serves every channel
  // here, so the fix is to add that account as a manager in YouTube Studio, not to
  // connect a second account.
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
