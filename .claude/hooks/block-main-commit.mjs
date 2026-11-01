// PreToolUse hook: block `git commit` while on main.
// Exit 2 blocks the tool call and sends stderr to Claude; exit 0 lets the normal permission flow continue.
import { execSync } from "node:child_process";

const input = JSON.parse(await new Response(process.stdin).text());
const command = input.tool_input?.command ?? "";

if (!/\bgit\s+commit\b/.test(command)) process.exit(0);

let branch = "";
try {
  branch = execSync("git branch --show-current", { cwd: input.cwd }).toString().trim();
} catch {
  process.exit(0); // not a git repo: nothing to protect
}

if (branch === "main") {
  console.error("Blocked: commits to main are not allowed. Create a feature branch (feat/<slug>) first.");
  process.exit(2);
}
process.exit(0);
