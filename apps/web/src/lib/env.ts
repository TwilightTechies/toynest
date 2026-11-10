import "server-only";
import path from "node:path";

// `next dev` runs with apps/web as the working directory.
export const repoRoot = path.join(process.cwd(), "../..");
export const dataDir = path.join(repoRoot, "data");

let loaded = false;

// One key file for the whole repo: the root .env.local (gitignored). Server-only; never NEXT_PUBLIC_.
// Variables already set in the environment win (process.loadEnvFile does not override them).
export function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  try {
    process.loadEnvFile(path.join(repoRoot, ".env.local"));
  } catch {
    // No file yet: callers report what is missing.
  }
}
