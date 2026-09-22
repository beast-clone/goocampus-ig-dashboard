// Which Instagram/Facebook page a task goes out on, from its primary interest (SBU).
// One list, used by the Scheduler's default page and the content calendar's channels.
//
// Agreed with Praveen on 22 Sep: mentorship → GooCampus World; 12thPlus.com and NEET UG
// → GooCampus India (12th Plus is UG only — NEET PG goes to Main); Samvaya has its own
// channel, so none of ours; everything else → GooCampus Main.
export type SbuPage = "GooCampus Main" | "GooCampus World" | "12Plus / GC India";

const WORLD = ["Mentorship Platform", "10K Mentorship"];
const INDIA = ["12thPlus.com", "India NEET UG Consulting"];
const NONE = ["Samvaya"];

const is = (list: string[], sbu: string) => list.some((s) => s.toLowerCase() === sbu);

/** null = the SBU isn't posted on any of our pages (Samvaya). */
export function pageForSbu(sbu: string | null | undefined): SbuPage | null {
  const s = (sbu || "").trim().toLowerCase();
  if (is(NONE, s)) return null;
  if (is(WORLD, s)) return "GooCampus World";
  if (is(INDIA, s)) return "12Plus / GC India";
  return "GooCampus Main";
}
