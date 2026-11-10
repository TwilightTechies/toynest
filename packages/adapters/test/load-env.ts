// Loads the root .env.local (gitignored) so the Supabase suites can run locally.
// Values are never printed. Without the file (e.g. in CI) those suites are skipped.
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env.local"));
} catch {
  // No .env.local: Supabase suites skip themselves.
}
