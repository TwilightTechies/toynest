// One behavioural contract for every implementation of the core repository ports.
// The in-memory adapters run it always; the Supabase adapters run it when a project is configured.
// Expected values come from the same synthetic JSON both data sources are loaded from.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CategoryRepository, CustomerRepository, OrderRepository, ProductRepository } from "@toynest/core";
import { describe, expect, it } from "vitest";
import { SampleCatalogSchema, type SampleProduct } from "../in-memory/sample-catalog";
import { SampleSupportSchema } from "../in-memory/sample-support";

export interface ContractSubject {
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  orders: OrderRepository;
  // Ids are generated per data source, so tests look customers up by email.
  customerIdFor(email: string): Promise<string>;
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../data");
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
export const catalog = SampleCatalogSchema.parse(read("sample-catalog.json"));
export const support = SampleSupportSchema.parse(read("sample-support.json"));

// Orders flagged simulateOutage only fail in the in-memory demo, so the shared contract avoids them.
const orders = support.orders.filter((order) => !order.simulateOutage);
const ordersOf = (sampleCustomerId: string) => orders.filter((order) => order.customerId === sampleCustomerId);
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Sample data has no ${what}`);
  return value;
}
const customerA = required(support.customers.find((c) => ordersOf(c.id).length >= 2), "customer with 2+ orders");
const customerB = required(
  support.customers.find((c) => c.id !== customerA.id && ordersOf(c.id).length >= 1),
  "second customer with an order",
);
const orderOfA = required(ordersOf(customerA.id)[0], "order for customer A");
const orderOfB = required(ordersOf(customerB.id)[0], "order for customer B");

export function describeRepositoryContract(name: string, setup: () => Promise<ContractSubject>, skip = false) {
  describe.skipIf(skip)(`repository contract: ${name}`, () => {
    let s: ContractSubject;
    const subject = async () => (s ??= await setup());

    describe("products", () => {
      it("lists every active product, with the full total, when there is no search text", async () => {
        const { items, total } = await (await subject()).products.search({ limit: 100, offset: 0 });
        expect(total).toBe(catalog.products.length);
        expect(items.map((p) => p.slug).sort()).toEqual(catalog.products.map((p) => p.slug).sort());
      });

      it('finds "wooden" products when searching for "wood"', async () => {
        const { items } = await (await subject()).products.search({ text: "wood", limit: 20, offset: 0 });
        expect(items.map((p) => p.slug)).toContain("wooden-number-puzzle");
      });

      it("pages results without changing the total", async () => {
        const { products } = await subject();
        const page = await products.search({ limit: 3, offset: 0 });
        expect(page.items).toHaveLength(3);
        expect(page.total).toBe(catalog.products.length);
      });

      it("filters by category", async () => {
        const { products, categories } = await subject();
        const stationery = (await categories.list()).find((c) => c.slug === "stationery")!;
        const { items } = await products.search({ categoryId: stationery.id, limit: 20, offset: 0 });
        const expected = catalog.products.filter((p) => p.categorySlug === "stationery").map((p) => p.slug);
        expect(items.map((p) => p.slug).sort()).toEqual(expected.sort());
      });

      it("finds by slug, and returns null for an unknown slug", async () => {
        const { products } = await subject();
        expect((await products.findBySlug("wooden-number-puzzle"))?.priceMinor).toBe(
          catalog.products.find((p) => p.slug === "wooden-number-puzzle")!.priceMinor,
        );
        expect(await products.findBySlug("no-such-product")).toBeNull();
      });

      it("returns attributes and the date added with each product", async () => {
        const product = await (await subject()).products.findBySlug("wooden-number-puzzle");
        const sample = catalog.products.find((p) => p.slug === "wooden-number-puzzle")!;
        expect(product?.attributes).toEqual({ ageRange: sample.ageRange, material: sample.material });
        expect(product?.createdAt).toBe(`${sample.addedOn}T00:00:00.000Z`);
      });

      // Expected orders are computed from the JSON with the same tie-break (name) as the SQL.
      const byName = (a: SampleProduct, b: SampleProduct) => a.name.localeCompare(b.name);
      const expectedOrder: Record<"price-asc" | "price-desc" | "newest" | "name", (a: SampleProduct, b: SampleProduct) => number> = {
        "price-asc": (a, b) => a.priceMinor - b.priceMinor || byName(a, b),
        "price-desc": (a, b) => b.priceMinor - a.priceMinor || byName(a, b),
        newest: (a, b) => b.addedOn.localeCompare(a.addedOn) || byName(a, b),
        name: byName,
      };

      it.each(Object.keys(expectedOrder) as (keyof typeof expectedOrder)[])("sorts by %s", async (sort) => {
        const { items } = await (await subject()).products.search({ sort, limit: 100, offset: 0 });
        expect(items.map((p) => p.slug)).toEqual([...catalog.products].sort(expectedOrder[sort]).map((p) => p.slug));
      });

      it("keeps the sort order across pages", async () => {
        const { products } = await subject();
        const page1 = await products.search({ sort: "price-asc", limit: 3, offset: 0 });
        const page2 = await products.search({ sort: "price-asc", limit: 3, offset: 3 });
        const all = await products.search({ sort: "price-asc", limit: 6, offset: 0 });
        expect([...page1.items, ...page2.items].map((p) => p.slug)).toEqual(all.items.map((p) => p.slug));
      });

      it("filters by an inclusive price range, with the filtered total", async () => {
        const { products } = await subject();
        const inRange = catalog.products.filter((p) => p.priceMinor >= 24900 && p.priceMinor <= 59900);
        const { items, total } = await products.search({ minPriceMinor: 24900, maxPriceMinor: 59900, limit: 100, offset: 0 });
        expect(total).toBe(inRange.length);
        expect(items.map((p) => p.slug).sort()).toEqual(inRange.map((p) => p.slug).sort());
      });
    });

    describe("categories", () => {
      it("lists every category with its required attributes", async () => {
        const list = await (await subject()).categories.list();
        expect(list).toHaveLength(catalog.categories.length);
        expect(list.find((c) => c.slug === "stationery")?.requiredAttributes).toEqual(["material"]);
      });
    });

    describe("customers", () => {
      it("finds a customer by id, and returns null for an unknown id", async () => {
        const { customers, customerIdFor } = await subject();
        expect((await customers.findById(await customerIdFor(customerA.email)))?.email).toBe(customerA.email);
        expect(await customers.findById("00000000-0000-4000-8000-000000000000")).toBeNull();
        expect(await customers.findById("not-an-id")).toBeNull();
      });
    });

    describe("orders (isolation layer 3: always scoped to one customer)", () => {
      it("finds the customer's own order with its lines and money in paise", async () => {
        const { orders: repo, customerIdFor } = await subject();
        const order = await repo.findForCustomer(await customerIdFor(customerA.email), orderOfA.id);
        expect(order).toMatchObject({
          id: orderOfA.id,
          status: orderOfA.status,
          totalMinor: orderOfA.totalMinor,
          refundedMinor: orderOfA.refundedMinor,
        });
        expect(order?.items.map((i) => [i.productSlug, i.quantity, i.unitPriceMinor])).toEqual(
          orderOfA.items.map((i) => [i.productSlug, i.quantity, i.unitPriceMinor]),
        );
      });

      it("returns null for another customer's order (indistinguishable from 'not found')", async () => {
        const { orders: repo, customerIdFor } = await subject();
        expect(await repo.findForCustomer(await customerIdFor(customerA.email), orderOfB.id)).toBeNull();
        expect(await repo.findForCustomer(await customerIdFor(customerA.email), "TN-0000")).toBeNull();
      });

      it("lists only the customer's orders, newest first, up to the limit", async () => {
        const { orders: repo, customerIdFor } = await subject();
        const list = await repo.listForCustomer(await customerIdFor(customerA.email), 10);
        const expected = support.orders
          .filter((o) => o.customerId === customerA.id)
          .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
          .map((o) => o.id);
        expect(list.map((o) => o.id)).toEqual(expected);
        expect(await repo.listForCustomer(await customerIdFor(customerA.email), 1)).toHaveLength(1);
      });
    });
  });
}
