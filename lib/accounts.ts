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
  { id: "wall_of_tunes", handle: "@wall_of_tunes", label: "Wall of Tunes", igUserId: "17841427051248054" },
  { id: "samvaya_matrimony", handle: "@samvaya_matrimony", label: "Samvaya Matrimony", igUserId: "17841444879120174" },
];

export const DEFAULT_ACCOUNT_ID = "goocampus";
