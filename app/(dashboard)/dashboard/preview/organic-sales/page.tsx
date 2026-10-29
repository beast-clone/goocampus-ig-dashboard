import { redirect } from "next/navigation";

// Organic Sales was removed (29 Oct 2026): it repeated e-Book Orders from an older,
// incomplete Airtable copy. Old links land on e-Book Orders (Organic Sales).
export default function OrganicSalesMoved() {
  redirect("/dashboard/preview/materials/ebooks");
}
