// Work the dashboard's Comment-button feedback from the terminal (used by the
// check-comments skill). Reads/writes the same store as System → Comments.
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/comments.ts list          # open only
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/comments.ts list --all
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/comments.ts resolve <id> "what was done"
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/comments.ts reopen <id>
import { commenterUrl, listComments, setCommentResolved } from "@/lib/comments";

const ist = (ts: number) => new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

(async () => {
  const [cmd, id, ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    const all = await listComments();
    const rows = process.argv.includes("--all") ? all : all.filter((c) => !c.resolved);
    console.log(`${rows.length} ${process.argv.includes("--all") ? "" : "open "}comment(s)\n`);
    for (const c of rows) {
      console.log(`[${c.id}] ${c.resolved ? "RESOLVED" : "OPEN"} · ${c.author} · ${ist(c.ts)}`);
      console.log(`  page:    ${c.ctx?.url || c.path}`);
      console.log(`  open as: ${commenterUrl(c)}   (the commenter's own view)`);
      if (c.ctx?.section) console.log(`  section: ${c.ctx.section}`);
      if (c.ctx?.target) console.log(`  clicked: ${c.ctx.target}`);
      if (c.ctx?.viewport) console.log(`  screen:  ${c.ctx.viewport}`);
      console.log(`  says:    ${c.text.replace(/\n/g, "\n           ")}`);
      if (c.resolvedNote) console.log(`  done:    ${c.resolvedNote}`);
      console.log("");
    }
    return;
  }
  if ((cmd === "resolve" || cmd === "reopen") && id) {
    const ok = await setCommentResolved(id, cmd === "resolve", "claude", rest.join(" "));
    console.log(ok ? `${cmd === "resolve" ? "Resolved" : "Reopened"} ${id}` : `No comment ${id}`);
    process.exit(ok ? 0 : 1);
  }
  console.error('Usage: comments.ts list [--all] | resolve <id> "note" | reopen <id>');
  process.exit(1);
})();
