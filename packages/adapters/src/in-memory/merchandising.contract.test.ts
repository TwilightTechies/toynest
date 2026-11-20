import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bestSellerSince, SOLD_ORDER_STATUSES, type Category, type Product } from "@toynest/core";
import { describe, expect, it } from "vitest";
import { daysBefore, describeMerchandisingContract, SHELF_FIXTURE } from "../contract/merchandising-contract";
import { createInMemoryMerchandisingRepository, loadSampleCatalog } from "./sample-catalog";
import { loadSampleSupport } from "./sample-support";

describeMerchandisingContract("in-memory", async () => {
  const now = new Date();
  const categories: Category[] = SHELF_FIXTURE.categories.map((c, i) => ({
    id: randomUUID(),
    slug: `fixture-${c.key}`,
    name: c.key,
    requiredAttributes: [],
    visible: c.visible,
    sortOrder: i,
    menuLabel: null,
  }));
  const categoryId = (key: string) => categories.find((c) => c.name === key)!.id;
  const ids = new Map(SHELF_FIXTURE.products.map((p) => [p.key, randomUUID()]));
  const products: Product[] = SHELF_FIXTURE.products.map((p) => ({
    id: ids.get(p.key)!,
    slug: `fixture-${p.key}`,
    name: p.name,
    description: "",
    categoryId: categoryId(p.category),
    priceMinor: 19900,
    currency: "INR",
    status: p.status,
    attributes: {},
    createdAt: daysBefore(now, p.addedDaysAgo),
  }));
  const repo = createInMemoryMerchandisingRepository({
    products,
    categories,
    featuredIds: new Set(SHELF_FIXTURE.products.filter((p) => p.featured).map((p) => ids.get(p.key)!)),
    sales: SHELF_FIXTURE.orders.flatMap((o) =>
      o.lines.map(([key, quantity]) => ({ productId: ids.get(key)!, quantity, status: o.status, placedAt: daysBefore(now, o.daysAgo) })),
    ),
  });
  return { repo, idOf: (key) => ids.get(key)!, now };
});

// Sample mode (no Supabase): the home page has both shelves out of the box.
describe("sample data shelves", () => {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../data");

  it("features the products flagged in the sample catalogue", async () => {
    const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
    expect((await catalog.merchandising.listFeatured(10)).length).toBeGreaterThanOrEqual(1);
  });

  it("ranks best sellers from the sample orders, measured from the latest of them", async () => {
    const { orderList } = await loadSampleSupport(path.join(dataDir, "sample-support.json"));
    const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"), { orders: orderList });
    const latest = new Date(Math.max(...orderList.map((o) => Date.parse(o.placedAt))));
    const best = await catalog.merchandising.listBestSellers({ since: bestSellerSince(latest), soldStatuses: SOLD_ORDER_STATUSES, limit: 4 });
    expect(best.length).toBeGreaterThanOrEqual(2);
  });
});
