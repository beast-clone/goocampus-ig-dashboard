// YouTube channel registry. Lives in lib/ (not the route file) because a Next.js
// App-Router route.ts may only export request handlers — exporting CHANNELS from
// the route violated that and broke the typed-routes build. Imported by the
// youtube route + comments/uploads routes + lib/youtube.ts.
export const CHANNELS: Record<string, { id: string; name: string; handle: string; channelId: string }> = {
  goocampus:      { id: "goocampus",      name: "GooCampus",        handle: "@goocampus",       channelId: "" },
  // Study Abroad (goocampusworld) was removed on 8 Oct 2026 at Maheen's request.
  // Nothing is published there. It was already gone from the reskinned page and
  // from YT_CHANNEL_PILLS in lib/brand-platforms.ts; this takes it out of the
  // registry too, so /api/youtube answers "unknown channel" rather than serving a
  // channel no tab offers.
  //
  // To bring it back: restore this line as
  //   goocampusworld: { id: "goocampusworld", name: "Study Abroad", handle: "@goocampusstudyabroad", channelId: "" },
  // and add it to the switcher in app/(dashboard)/dashboard/youtube/page.tsx. Its
  // credentials are untouched — YOUTUBE_REFRESH_TOKENS and YOUTUBE_CHANNEL_IDS
  // still carry "goocampusworld", and the loader below ignores keys with no entry
  // here, so nothing has to be re-authorised.
  twelfthplus:    { id: "twelfthplus",    name: "12thplus",         handle: "@12thplus",        channelId: "" },
  // Samvaya Matrimony, UCUdAtN5wd4x5NR9Pxmmnucw — not the similarly-named "@samvaya",
  // which belongs to somebody else. The handle stays BLANK until the channel sets one.
  //
  // It needs its OWN refresh token: a token is bound to the channel picked at Google's
  // chooser during consent, so no manager grant makes an existing token reach it.
  // Get one with "Connect this channel" on the YouTube tab (stored in
  // mh_integration_tokens as "youtube:samvaya") or scripts/connect-youtube-channel.mjs.
  // Until then the tab says "not connected" (hasChannelGrant in lib/youtube.ts).
  samvaya:        { id: "samvaya",        name: "Samvaya Matrimony", handle: "",                 channelId: "UCUdAtN5wd4x5NR9Pxmmnucw" },
};

// Fill channelIds from env: YOUTUBE_CHANNEL_IDS = {"goocampus":"UCxxxx", ...}.
// Channels without an id stay on demo data.
try {
  const map = JSON.parse(process.env.YOUTUBE_CHANNEL_IDS || "{}") as Record<string, unknown>;
  for (const [k, v] of Object.entries(map)) {
    if (CHANNELS[k] && typeof v === "string") CHANNELS[k].channelId = v;
  }
} catch { /* malformed env → all channels stay demo */ }
