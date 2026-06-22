export type IGAccount = {
  id: string;
  handle: string;
  label: string;
  igUserId?: string;
};

export const ACCOUNTS: IGAccount[] = [
  { id: "acc1", handle: "@goocampus", label: "GooCampus (placeholder)" },
  { id: "acc2", handle: "@account2", label: "Account 2 (placeholder)" },
  { id: "acc3", handle: "@account3", label: "Account 3 (placeholder)" },
  { id: "acc4", handle: "@account4", label: "Account 4 (placeholder)" },
  { id: "acc5", handle: "@account5", label: "Account 5 (placeholder)" },
];
