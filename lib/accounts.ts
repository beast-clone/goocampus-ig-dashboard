export type IGAccount = {
  id: string;
  handle: string;
  label: string;
  igUserId?: string;
};

export const ACCOUNTS: IGAccount[] = [
  { id: "goocampusworld", handle: "@goocampusworld", label: "GooCampus World", igUserId: "17841473429363077" },
];
