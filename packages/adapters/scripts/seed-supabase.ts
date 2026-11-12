// Seeds the Supabase project from the same synthetic JSON the in-memory adapters use, so both data
// sources hold identical data. Idempotent: re-running updates rows instead of duplicating them.
// Run: npm run seed:supabase -w @toynest/adapters   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  describeSampleProduct,
  SampleCatalogSchema,
  sampleProductAttributes,
  sampleProductCreatedAt,
} from "../src/in-memory/sample-catalog";
import { SampleSupportSchema } from "../src/in-memory/sample-support";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "../src/supabase/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(repoRoot, "data", file), "utf8"));

// Upserts rows and returns a lookup from the conflict key to the generated uuid.
async function upsert(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  key: string,
): Promise<Map<string, string>> {
  const { data, error } = await client.from(table).upsert(rows, { onConflict: key }).select(`id, ${key}`);
  if (error) throw new Error(`Seeding ${table} failed: ${error.message}`);
  // Validate what came back (an external boundary) instead of casting it.
  const returned = z.array(z.record(z.string(), z.unknown())).parse(data ?? []);
  return new Map(returned.map((row) => [z.string().parse(row[key]), z.string().parse(row.id)]));
}

async function main() {
  const env = readSupabaseEnv();
  if (!env) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.local first.");
  // Service role: seeding writes, which no RLS policy allows for anon or signed-in users.
  const client = createSupabaseClient({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });

  const catalog = SampleCatalogSchema.parse(await readJson("sample-catalog.json"));
  const support = SampleSupportSchema.parse(await readJson("sample-support.json"));

  const categoryIds = await upsert(
    client,
    "categories",
    catalog.categories.map((c) => ({ slug: c.slug, name: c.name, required_attributes: c.requiredAttributes })),
    "slug",
  );

  const productIds = await upsert(
    client,
    "products",
    catalog.products.map((p) => {
      const categoryId = categoryIds.get(p.categorySlug);
      if (!categoryId) throw new Error(`Product ${p.slug} references unknown category ${p.categorySlug}`);
      return {
        slug: p.slug,
        name: p.name,
        description: describeSampleProduct(p),
        category_id: categoryId,
        price_minor: p.priceMinor,
        currency: p.currency,
        status: "active",
        attributes: sampleProductAttributes(p),
        created_at: sampleProductCreatedAt(p),
      };
    }),
    "slug",
  );

  // Demo customers have no Supabase Auth account (auth_user_id stays null): the app's mock sign-in
  // reads them server-side. Sample ids like "cus_1001" are mapped to the generated uuids by email.
  const customerIdsByEmail = await upsert(
    client,
    "customers",
    support.customers.map((c) => ({ name: c.name, email: c.email })),
    "email",
  );
  const customerIdBySampleId = new Map(
    support.customers.map((c) => [c.id, customerIdsByEmail.get(c.email)] as const),
  );

  const orderIds = await upsert(
    client,
    "orders",
    support.orders.map((o) => {
      const customerId = customerIdBySampleId.get(o.customerId);
      if (!customerId) throw new Error(`Order ${o.id} references unknown customer ${o.customerId}`);
      return {
        order_number: o.id,
        customer_id: customerId,
        status: o.status,
        placed_at: o.placedAt,
        delivered_at: o.deliveredAt,
        total_minor: o.totalMinor,
        refunded_minor: o.refundedMinor,
        currency: o.currency,
      };
    }),
    "order_number",
  );

  // Order lines have no natural key, so replace them wholesale for the seeded orders.
  const seededOrderIds = [...orderIds.values()];
  const removed = await client.from("order_items").delete().in("order_id", seededOrderIds);
  if (removed.error) throw new Error(`Clearing order_items failed: ${removed.error.message}`);
  const items = support.orders.flatMap((o) =>
    o.items.map((item) => ({
      order_id: orderIds.get(o.id),
      product_id: productIds.get(item.productSlug) ?? null,
      product_slug: item.productSlug,
      product_name: item.name,
      unit_price_minor: item.unitPriceMinor,
      quantity: item.quantity,
    })),
  );
  const inserted = await client.from("order_items").insert(items);
  if (inserted.error) throw new Error(`Seeding order_items failed: ${inserted.error.message}`);

  console.log(
    `Seeded ${categoryIds.size} categories, ${productIds.size} products, ` +
      `${customerIdsByEmail.size} customers, ${orderIds.size} orders, ${items.length} order items.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
