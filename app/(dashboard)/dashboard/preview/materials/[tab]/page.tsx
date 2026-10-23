import { notFound } from "next/navigation";
import { mtab } from "@/lib/materials";
import { MaterialsView } from "./MaterialsView";

// Marketing Materials — one route for the six tabs (lib/materials.ts).
export default function MaterialsPage({ params }: { params: { tab: string } }) {
  const tab = mtab(params.tab);
  if (!tab) notFound();
  return <MaterialsView tab={tab} />;
}
