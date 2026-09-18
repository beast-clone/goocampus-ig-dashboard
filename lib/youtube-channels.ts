// YouTube channel registry. Lives in lib/ (not the route file) because a Next.js
// App-Router route.ts may only export request handlers — exporting CHANNELS from
// the route violated that and broke the typed-routes build. Imported by the
// youtube route + comments/uploads routes + lib/youtube.ts.
export const CHANNELS: Record<string, { id: string; name: string; handle: string; channelId: string }> = {
  goocampus:      { id: "goocampus",      name: "GooCampus",        handle: "@goocampus",       channelId: "" },
  goocampusworld: { id: "goocampusworld", name: "Study Abroad",     handle: "@goocampusstudyabroad", channelId: "" },
  twelfthplus:    { id: "twelfthplus",    name: "12thplus",         handle: "@12thplus",        channelId: "" },
};

// Fill channelIds from env: YOUTUBE_CHANNEL_IDS = {"goocampus":"UCxxxx", ...}.
// Channels without an id stay on demo data.
try {
  const map = JSON.parse(process.env.YOUTUBE_CHANNEL_IDS || "{}") as Record<string, unknown>;
  for (const [k, v] of Object.entries(map)) {
    if (CHANNELS[k] && typeof v === "string") CHANNELS[k].channelId = v;
  }
} catch { /* malformed env → all channels stay demo */ }
