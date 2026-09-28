import type { Metadata } from "next";
import { Landing } from "./Landing";

// The public front page for GooCampus Marketing OS — what the dashboard is, what's
// inside it, then Sign in. Built 28 Sep as an offline draft: nothing links here yet
// and "/" still goes straight to the dashboard. It is outside the middleware matcher
// (/dashboard, /me, /login, /api), so it needs no session.
export const metadata: Metadata = {
  title: "GooCampus Marketing OS",
  description: "One board for the whole content team — plan, write, produce, publish and measure.",
};

export default function WelcomePage() {
  return <Landing />;
}
