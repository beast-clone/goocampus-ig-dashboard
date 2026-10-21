// Single source of truth: which brand has which platform CONNECTED to the
// dashboard. Profile mode grays out (never navigates to) platforms a brand
// doesn't have, so one brand's numbers can never appear inside another's
// profile. Update here when a new page/channel gets connected.

// Dashboard account id → LinkedIn page key. Both live: the same member token
// (info@goocampus) is Super Admin of BOTH pages — main GooCampus (org 3358713)
// and World (org 107157863). Each resolves via its own LINKEDIN_ORG_URN_* env var
// (LINKEDIN_ORG_URN_GOOCAMPUS / LINKEDIN_ORG_URN_GCWORLD); both must be set for the
// data to be correct.
export const LI_PAGE: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "gcworld",
  "12thplusdotcom": null,
  samvaya_matrimony: null,
};

// Dashboard account id → YouTube channel key. null means the brand has no
// YouTube, and hasPlatform() greys the tab out for that profile so one brand's
// numbers can never surface inside another's.
//
// GooCampus World has no YouTube channel. The "Study Abroad" channel that used
// to be reachable from the switcher was a separate GooCampus channel attached to
// no brand; it was removed entirely on 8 Oct 2026 — nothing is published there.
//
// Samvaya connected its own channel on 8 Oct (Samvaya Matrimony,
// UCUdAtN5wd4x5NR9Pxmmnucw), so samvaya_matrimony is no longer null.
export const YT_CHANNEL: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: null,
  "12thplusdotcom": "twelfthplus",
  samvaya_matrimony: "samvaya",
};

// All YouTube channels — pills shown on YouTube pages in MAIN mode only.
// Keep this in step with the switcher on each YouTube page. They are separate
// lists, and that is exactly how Study Abroad survived in one of them after being
// removed from the others — so when a channel is added or dropped, change all of:
// this list, app/(dashboard)/dashboard/youtube/page.tsx, the preview page, and
// CHANNELS in lib/youtube-channels.ts.
export const YT_CHANNEL_PILLS = [
  { key: "goocampus", label: "GooCampus" },
  { key: "twelfthplus", label: "12thplus" },
  { key: "samvaya", label: "Samvaya" },
  // Study Abroad (goocampusworld) removed 8 Oct 2026 — nothing is published there.
];

export type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";

// Every brand has an Instagram account + a Facebook page connected.
export function hasPlatform(accountId: string, platform: PlatformKey): boolean {
  if (platform === "instagram" || platform === "facebook") return true;
  if (platform === "linkedin") return !!LI_PAGE[accountId];
  if (platform === "youtube") return !!YT_CHANNEL[accountId];
  return false;
}
