import { redirect } from "next/navigation";

// The marketing-skills library was folded into Content Studio (the "Playbooks" tab).
// Keep this route as a redirect so any old link lands in the right place.
export default function MarketingSkillsRedirect() {
  redirect("/dashboard/hope-preview/content-studio?tab=playbooks");
}
