// Makes someone a ToyNest admin (ADR-016). Run it yourself, in your own terminal:
//   npm run admin:create -w @toynest/adapters -- you@example.com
// Creates the Supabase Auth user (asking for a password with hidden input) or reuses an existing one,
// then adds their id to public.admin_users with the service role. Never pass the password as an
// argument: it would land in your shell history.
import { createInterface } from "node:readline";
import { z } from "zod";
import { createSupabaseClient, readSupabaseEnv } from "../src/supabase/client";

const MIN_PASSWORD = 12;

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Swallow the echo of typed characters; still print the question and the final newline.
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.startsWith(question) || s === "\r\n" || s === "\n") write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = z.email().safeParse(process.argv[2]);
  if (!email.success) throw new Error("Usage: npm run admin:create -w @toynest/adapters -- you@example.com");
  const env = readSupabaseEnv();
  if (!env) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the root .env.local");
  const client = createSupabaseClient({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });

  // listUsers is paged; a small project fits in the first page, but walk them all to be safe.
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((user) => user.email?.toLowerCase() === email.data.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }

  if (userId) {
    console.log(`Existing user found for ${email.data}; keeping their password.`);
  } else {
    const password = await askHidden(`New password for ${email.data} (min ${MIN_PASSWORD} chars): `);
    if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
    if ((await askHidden("Repeat it: ")) !== password) throw new Error("Passwords didn't match");
    const created = await client.auth.admin.createUser({ email: email.data, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    console.log(`Created user ${email.data}.`);
  }

  const grant = await client.from("admin_users").upsert({ auth_user_id: userId }, { onConflict: "auth_user_id" });
  if (grant.error) throw new Error(`Adding to admin_users failed: ${grant.error.message}`);
  console.log(`${email.data} is now an admin. Sign in at /admin/login.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
