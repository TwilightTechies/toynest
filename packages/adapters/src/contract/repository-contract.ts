// One behavioural contract for every implementation of the core repository ports.
// The in-memory adapters run it always; the Supabase adapters run it when a project is configured.
// Expected values come from the same synthetic JSON both data sources are loaded from.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CartRepository,
  CategoryRepository,
  CustomerRepository,
  OrderRepository,
  ProductRepository,
  ShippingZoneRepository,
} from "@toynest/core";
import { afterAll, describe, expect, it } from "vitest";
import { SampleCatalogSchema, type SampleProduct } from "../in-memory/sample-catalog";
import { ShippingZonesFileSchema } from "../in-memory/sample-cart";
import { SampleSupportSchema } from "../in-memory/sample-support";

export interface ContractSubject {
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  orders: OrderRepository;
  carts: CartRepository;
  shippingZones: ShippingZoneRepository;
  // Ids are generated per data source, so tests look customers up by email.
  customerIdFor(email: string): Promise<string>;
  // Removes baskets the tests created (a real database keeps them otherwise).
  deleteCarts?(ids: string[]): Promise<void>;
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../data");
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
export const catalog = SampleCatalogSchema.parse(read("sample-catalog.json"));
export const support = SampleSupportSchema.parse(read("sample-support.json"));
export const shipping = ShippingZonesFileSchema.parse(read("shipping-zones.json"));

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

      it("finds products by id, ignoring unknown ids", async () => {
        const { products } = await subject();
        const puzzle = (await products.findBySlug("wooden-number-puzzle"))!;
        const train = (await products.findBySlug("personalised-name-train"))!;
        const found = await products.findByIds([puzzle.id, train.id, "00000000-0000-4000-8000-000000000000"]);
        expect(found.map((p) => p.slug).sort()).toEqual(["personalised-name-train", "wooden-number-puzzle"]);
        expect(train.attributes.personalisation).toBe("name");
        expect(await products.findByIds([])).toEqual([]);
      });
    });

    describe("shipping zones", () => {
      it("lists every zone from the shared JSON, with exactly one default", async () => {
        const zones = await (await subject()).shippingZones.list();
        expect(zones.map((z) => z.slug).sort()).toEqual(shipping.zones.map((z) => z.slug).sort());
        expect(zones.filter((z) => z.isDefault)).toHaveLength(1);
        const metro = zones.find((z) => z.slug === "metro");
        expect(metro).toMatchObject({ feeMinor: 4900, freeOverMinor: 49900 });
        expect(metro?.pincodePrefixes).toContain("560");
      });
    });

    describe("carts (scoped by the cart id from the cookie)", () => {
      const created: string[] = [];
      afterAll(async () => {
        if (created.length > 0) await s?.deleteCarts?.(created);
      });
      const newCart = async () => {
        const cart = await (await subject()).carts.create();
        created.push(cart.id);
        return cart;
      };
      const productId = async (slug: string) => (await (await subject()).products.findBySlug(slug))!.id;

      it("creates an empty cart and returns null for unknown ids", async () => {
        const { carts } = await subject();
        const cart = await newCart();
        expect(cart).toMatchObject({ pincode: null, lines: [] });
        expect(await carts.get("00000000-0000-4000-8000-000000000000")).toBeNull();
        expect(await carts.get("not-a-uuid")).toBeNull();
      });

      it("merges adds of the same product and name, capped at 10", async () => {
        const { carts } = await subject();
        const cart = await newCart();
        const puzzle = await productId("wooden-number-puzzle");
        await carts.addLine(cart.id, { productId: puzzle, personalisationName: null, quantity: 2 });
        await carts.addLine(cart.id, { productId: puzzle, personalisationName: null, quantity: 3 });
        expect((await carts.get(cart.id))?.lines.map((l) => l.quantity)).toEqual([5]);
        await carts.addLine(cart.id, { productId: puzzle, personalisationName: null, quantity: 9 });
        expect((await carts.get(cart.id))?.lines.map((l) => l.quantity)).toEqual([10]);
      });

      it("keeps the same product with two names as two lines, in the order added", async () => {
        const { carts } = await subject();
        const cart = await newCart();
        const train = await productId("personalised-name-train");
        await carts.addLine(cart.id, { productId: train, personalisationName: "Aarav", quantity: 1 });
        await carts.addLine(cart.id, { productId: train, personalisationName: "Diya", quantity: 1 });
        await carts.addLine(cart.id, { productId: train, personalisationName: "Aarav", quantity: 1 });
        const lines = (await carts.get(cart.id))!.lines;
        expect(lines.map((l) => [l.personalisationName, l.quantity])).toEqual([
          ["Aarav", 2],
          ["Diya", 1],
        ]);
      });

      it("updates and removes lines, but only within the same cart", async () => {
        const { carts } = await subject();
        const mine = await newCart();
        const other = await newCart();
        await carts.addLine(mine.id, { productId: await productId("wind-up-robot"), personalisationName: null, quantity: 1 });
        const [line] = (await carts.get(mine.id))!.lines;

        // Another cart's id with my line id: not found, nothing changes.
        expect(await carts.setQuantity(other.id, line!.id, 7)).toBe(false);
        expect(await carts.removeLine(other.id, line!.id)).toBe(false);
        expect((await carts.get(mine.id))?.lines[0]?.quantity).toBe(1);

        expect(await carts.setQuantity(mine.id, line!.id, 4)).toBe(true);
        expect((await carts.get(mine.id))?.lines[0]?.quantity).toBe(4);
        expect(await carts.removeLine(mine.id, line!.id)).toBe(true);
        expect((await carts.get(mine.id))?.lines).toEqual([]);
        expect(await carts.removeLine(mine.id, line!.id)).toBe(false);
      });

      it("stores and clears the pincode", async () => {
        const { carts } = await subject();
        const cart = await newCart();
        await carts.setPincode(cart.id, "560001");
        expect((await carts.get(cart.id))?.pincode).toBe("560001");
        await carts.setPincode(cart.id, null);
        expect((await carts.get(cart.id))?.pincode).toBeNull();
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
