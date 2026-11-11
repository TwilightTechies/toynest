// Runs the shared contract against the configured Supabase project (seeded with
// `npm run seed:supabase -w @toynest/adapters`). Skipped when Supabase is not configured.
import { describe, expect, it } from "vitest";
import { describeRepositoryContract } from "../contract/repository-contract";
import { createSupabaseClient, readSupabaseEnv } from "./client";
import { createSupabaseRepositories } from "./repositories";

const env = readSupabaseEnv();
const client = env ? createSupabaseClient({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 }) : null;

async function customerIdFor(email: string): Promise<string> {
  const { data, error } = await client!.from("customers").select("id").eq("email", email).single();
  if (error) throw new Error(`Seeded customer ${email} not found. Did you run the seed? (${error.message})`);
  return (data as { id: string }).id;
}

describeRepositoryContract("Supabase", async () => ({ ...createSupabaseRepositories(client!), customerIdFor }), !env);

// Full-text search behaviour that only Postgres provides (the in-memory adapter does substring matching).
describe.skipIf(!env)("Supabase full-text search", () => {
  const products = () => createSupabaseRepositories(client!).products;

  it('stems plurals: "puzzles" finds the puzzle', async () => {
    const { items } = await products().search({ text: "puzzles", limit: 10, offset: 0 });
    expect(items.map((p) => p.slug)).toContain("wooden-number-puzzle");
  });

  it("ranks a name match (weight A) above description-only matches (weight B)", async () => {
    // "Wooden" is in the puzzle's name; other wooden toys only say "Material: Wood" in the description.
    const { items } = await products().search({ text: "wood", limit: 10, offset: 0 });
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]?.slug).toBe("wooden-number-puzzle");
  });

  it("ignores punctuation that would break raw tsquery syntax", async () => {
    await expect(products().search({ text: "wood & | ! ( ':*", limit: 10, offset: 0 })).resolves.toBeDefined();
  });

  it("returns nothing (not an error) when no product matches", async () => {
    expect(await products().search({ text: "spaceship", limit: 10, offset: 0 })).toEqual({ items: [], total: 0 });
  });
});
