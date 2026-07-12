// Single source of truth: which brand has which platform CONNECTED to the
// dashboard. Profile mode grays out (never navigates to) platforms a brand
// doesn't have, so one brand's numbers can never appear inside another's
// profile. Update here when a new page/channel gets connected.

// Dashboard account id → LinkedIn page key (live only for World; main GooCampus
// LinkedIn is pending LinkedIn's API approval — counts as NOT connected).
export const LI_PAGE: Record<string, string | null> = {
  goocampus: null,
  goocampusworld: "gcworld",
  "12thplusdotcom": null,
  samvaya_matrimony: null,
};

// Dashboard account id → YouTube channel key.
export const YT_CHANNEL: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "goocampusworld", // = the Study Abroad channel
  "12thplusdotcom": "twelfthplus",
  samvaya_matrimony: null,
};

// All YouTube channels — pills shown on YouTube pages in MAIN mode only.
export const YT_CHANNEL_PILLS = [
  { key: "goocampus", label: "GooCampus" },
  { key: "goocampusworld", label: "Study Abroad" },
  { key: "twelfthplus", label: "12thplus" },
];

export type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";

// Every brand has an Instagram account + a Facebook page connected.
export function hasPlatform(accountId: string, platform: PlatformKey): boolean {
  if (platform === "instagram" || platform === "facebook") return true;
  if (platform === "linkedin") return !!LI_PAGE[accountId];
  if (platform === "youtube") return !!YT_CHANNEL[accountId];
  return false;
}
