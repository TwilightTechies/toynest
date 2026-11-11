import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type { SupabaseClient };

const SupabaseEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  // Server-only. Bypasses RLS, so it must never reach a browser or a NEXT_PUBLIC_ variable.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // Public key. Requests made with it (plus a user's session) are subject to RLS.
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

export type SupabaseEnv = z.infer<typeof SupabaseEnvSchema>;

// null = Supabase is not configured (callers fall back to the sample data).
// Throws when the variables are present but malformed, so a typo is not silently ignored.
export function readSupabaseEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEnv | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const parsed = SupabaseEnvSchema.safeParse({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || undefined,
  });
  if (!parsed.success) {
    // Name the variables, never echo their values.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(", ");
    throw new Error(`Supabase environment variables are malformed: ${names}`);
  }
  return parsed.data;
}

export interface SupabaseClientOptions {
  url: string;
  key: string;
  // A slow database must surface as "couldn't check" instead of hanging the request.
  timeoutMs?: number;
}

// Adapters receive a client; the composition root decides which key it carries
// (service role on the server today; a signed-in user's session once real auth exists).
export function createSupabaseClient({ url, key, timeoutMs = 5000 }: SupabaseClientOptions): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }),
    },
  });
}
