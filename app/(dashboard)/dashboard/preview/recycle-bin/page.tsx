import { RecycleBinView } from "./RecycleBinView";
import { getSessionIsAdmin } from "@/lib/auth";

// Dashboard-wide recycle bin. It used to be a left-nav item buried inside Marketing
// Hub's master sheet, which is a strange place to look for something you deleted by
// accident — a bin belongs at the edge of the whole dashboard, not inside one tab.
//
// Two tiers, because "Delete forever" used to mean it:
//   · Recycle bin   — deleted tasks, restorable by anyone with delete_tasks
//   · Deleted archive — emptied from the bin, still kept, recoverable by an admin only
// Nothing is ever actually destroyed. See sql/019_trash_two_tier.sql.
export const dynamic = "force-dynamic";

export default function RecycleBinPage() {
  return <RecycleBinView isAdmin={getSessionIsAdmin()} />;
}
