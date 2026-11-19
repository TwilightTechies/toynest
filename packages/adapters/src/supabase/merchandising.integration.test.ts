// Home-page shelves against the real project (ADR-021): the shared merchandising contract on
// throwaway rows (two categories, seven products, seven guest orders), plus the access rules of
// best_selling_products. Everything is deleted afterwards.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomInt, randomUUID } from "node:crypto";
import { bestSellerSince, SOLD_ORDER_STATUSES } from "@toynest/core";
import { afterAll, describe, expect, it } from "vitest";
import { daysBefore, describeMerchandisingContract, SHELF_FIXTURE } from "../contract/merchandising-contract";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseMerchandisingRepository } from "./merchandising-repository";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;
const run = randomUUID().slice(0, 8);
const CONTACT_EMAIL = `merch-test-${run}@example.com`;

let service: SupabaseClient | undefined;
const created = { categories: [] as string[], products: [] as string[], orders: [] as string[] };
const productIds = new Map<string, string>();
const now = new Date();

const must = <T,>(result: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? "no data"}`);
  return result.data;
};

async function seedFixture(client: SupabaseClient) {
  const categoryIds = new Map<string, string>();
  for (const category of SHELF_FIXTURE.categories) {
    const row = must(
      await client
        .from("categories")
        .insert({ slug: `merch-test-${category.key}-${run}`, name: `Merch test ${category.key} ${run}`, required_attributes: [], visible: category.visible })
        .select("id")
        .single(),
      "insert category",
    ) as { id: string };
    created.categories.push(row.id);
    categoryIds.set(category.key, row.id);
  }

  for (const product of SHELF_FIXTURE.products) {
    const row = must(
      await client
        .from("products")
        .insert({
          slug: `merch-test-${product.key}-${run}`,
          // Same prefix on every name, so "ties by name" keeps the fixture's order.
          name: `Merch test ${run} ${product.name}`,
          category_id: categoryIds.get(product.category),
          price_minor: 19900,
          currency: "INR",
          status: product.status,
          featured: product.featured,
          created_at: daysBefore(now, product.addedDaysAgo),
        })
        .select("id")
        .single(),
      "insert product",
    ) as { id: string };
    created.products.push(row.id);
    productIds.set(product.key, row.id);
  }

  for (const order of SHELF_FIXTURE.orders) {
    const row = must(
      await client
        .from("orders")
        .insert({
          // TN-9xxxxxxx: the test range, never produced by the checkout sequence (TN-2xxxx).
          order_number: `TN-9${String(randomInt(0, 10_000_000)).padStart(7, "0")}`,
          status: order.status,
          placed_at: daysBefore(now, order.daysAgo),
          total_minor: 19900 * order.lines.reduce((sum, [, quantity]) => sum + quantity, 0),
          currency: "INR",
          contact_name: "Merch Test",
          contact_email: CONTACT_EMAIL,
          contact_phone: "9876543210",
          address_line1: "1 Test Street",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560001",
        })
        .select("id")
        .single(),
      "insert order",
    ) as { id: string };
    created.orders.push(row.id);
    const lines = order.lines.map(([key, quantity]) => ({
      order_id: row.id,
      product_id: productIds.get(key),
      product_slug: `merch-test-${key}-${run}`,
      product_name: key,
      unit_price_minor: 19900,
      quantity,
    }));
    must(await client.from("order_items").insert(lines).select("id"), "insert order items");
  }
}

afterAll(async () => {
  if (!service) return;
  // Orders first (their items cascade), then products, then categories.
  await service.from("orders").delete().eq("contact_email", CONTACT_EMAIL);
  if (created.products.length) await service.from("products").delete().in("id", created.products);
  if (created.categories.length) await service.from("categories").delete().in("id", created.categories);
});

describeMerchandisingContract(
  "Supabase",
  async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
    await seedFixture(service);
    return { repo: createSupabaseMerchandisingRepository(service), idOf: (key) => productIds.get(key)!, now };
  },
  !ready,
);

describe.skipIf(!ready)("best_selling_products access (security definer)", () => {
  it("anonymous shoppers get the ranking but still can't read the orders behind it", async () => {
    // The contract above seeded the fixture; wait for it if this file's tests run first.
    if (!service) {
      service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
      await seedFixture(service);
    }
    const anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 20000 });
    const ranking = await createSupabaseMerchandisingRepository(anonymous).listBestSellers({
      since: bestSellerSince(now),
      soldStatuses: SOLD_ORDER_STATUSES,
      limit: 100,
    });
    expect(ranking.map((p) => p.id)).toContain(productIds.get("alpha"));

    const orders = await anonymous.from("orders").select("id").in("id", created.orders);
    expect(orders.data ?? []).toEqual([]);
    const items = await anonymous.from("order_items").select("id").in("order_id", created.orders);
    expect(items.data ?? []).toEqual([]);
  });

  it("returns product columns only: no quantities or order data", async () => {
    const anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 20000 });
    const raw = await anonymous.rpc("best_selling_products", { since: bestSellerSince(now), sold_statuses: [...SOLD_ORDER_STATUSES], page_limit: 1 });
    expect(raw.error).toBeNull();
    const first = (raw.data as Record<string, unknown>[])[0];
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["attributes", "category_id", "created_at", "currency", "description", "id", "name", "price_minor", "slug", "status"].sort(),
    );
  });
});
