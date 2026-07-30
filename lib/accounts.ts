export type IGAccount = {
  id: string;
  handle: string;
  label: string;
  igUserId?: string;
};

export const ACCOUNTS: IGAccount[] = [
  { id: "goocampus", handle: "@goocampus", label: "GooCampus Edu (main)", igUserId: "17841407196182440" },
  { id: "goocampusworld", handle: "@goocampusworld", label: "GooCampus World", igUserId: "17841473429363077" },
  { id: "12thplusdotcom", handle: "@12thplusdotcom", label: "GooCampus India (12thplus)", igUserId: "17841451240960832" },
  // Samvaya is a separate business (no token in accounts.local.json) — selecting it
  // showed mock data as "live" and violates the "never touch Samvaya" rule, so it's
  // out of the switcher. Its igUserId (17841444879120174) is kept in git history if ever needed.
];

export const DEFAULT_ACCOUNT_ID = "goocampus";
