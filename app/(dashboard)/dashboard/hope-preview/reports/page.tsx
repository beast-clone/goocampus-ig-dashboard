import { redirect } from "next/navigation";

// /reports has no page of its own — the nav folder opens straight to the
// Social Media Reports view.
export default function ReportsIndex() {
  redirect("/dashboard/hope-preview/reports/social");
}
