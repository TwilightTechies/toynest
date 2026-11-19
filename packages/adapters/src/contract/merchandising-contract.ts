// One behavioural contract for MerchandisingRepository (ADR-021), run by the in-memory adapter always
// and by the Supabase adapter when a project is configured. Both load the same fixture: the in-memory
// test builds it directly, the Supabase test inserts it as throwaway rows. A live database also holds
// other products and orders, so every assertion looks only at the fixture's own products, in order.
import { bestSellerSince, SOLD_ORDER_STATUSES, type MerchandisingRepository, type OrderStatus, type ProductStatus } from "@toynest/core";
import { describe, expect, it } from "vitest";

type CategoryKey = "shown" | "hidden";

export interface FixtureProduct {
  key: string;
  name: string;
  category: CategoryKey;
  status: ProductStatus;
  featured: boolean;
  addedDaysAgo: number;
}

export interface FixtureOrder {
  status: OrderStatus;
  daysAgo: number;
  lines: [productKey: string, quantity: number][];
}

export const SHELF_FIXTURE: {
  categories: { key: CategoryKey; visible: boolean }[];
  products: FixtureProduct[];
  orders: FixtureOrder[];
} = {
  categories: [
    { key: "shown", visible: true },
    { key: "hidden", visible: false },
  ],
  products: [
    { key: "alpha", name: "Alpha", category: "shown", status: "active", featured: true, addedDaysAgo: 30 },
    { key: "bravo", name: "Bravo", category: "shown", status: "active", featured: false, addedDaysAgo: 20 },
    { key: "charlie", name: "Charlie", category: "shown", status: "active", featured: true, addedDaysAgo: 10 },
    // Featured but not for sale: archived, in a hidden category, still a draft.
    { key: "delta", name: "Delta", category: "shown", status: "archived", featured: true, addedDaysAgo: 5 },
    { key: "echo", name: "Echo", category: "hidden", status: "active", featured: true, addedDaysAgo: 5 },
    { key: "golf", name: "Golf", category: "shown", status: "draft", featured: true, addedDaysAgo: 1 },
    // For sale, never sold, not featured.
    { key: "foxtrot", name: "Foxtrot", category: "shown", status: "active", featured: false, addedDaysAgo: 40 },
  ],
  orders: [
    { status: "placed", daysAgo: 2, lines: [["alpha", 2], ["bravo", 3]] },
    { status: "delivered", daysAgo: 20, lines: [["alpha", 2]] },
    { status: "dispatched", daysAgo: 5, lines: [["charlie", 3]] },
    // Not sales: cancelled, unpaid, and outside the 90-day window.
    { status: "cancelled", daysAgo: 3, lines: [["charlie", 10]] },
    { status: "awaiting_payment", daysAgo: 1, lines: [["bravo", 5]] },
    { status: "placed", daysAgo: 120, lines: [["charlie", 20]] },
    // Sold, but no longer for sale.
    { status: "placed", daysAgo: 4, lines: [["delta", 50], ["echo", 50], ["golf", 50]] },
  ],
};

export interface MerchandisingSubject {
  repo: MerchandisingRepository;
  // Fixture key -> product id in this data source.
  idOf(key: string): string;
  // The clock the fixture's "days ago" were measured from.
  now: Date;
}

export function describeMerchandisingContract(name: string, setup: () => Promise<MerchandisingSubject>, skip = false) {
  describe.skipIf(skip)(`merchandising contract: ${name}`, () => {
    let s: MerchandisingSubject;
    const subject = async () => (s ??= await setup());
    // Keys of the fixture's products in the order the repository returned them.
    const fixtureKeys = (ids: string[], subject: MerchandisingSubject) => {
      const keyById = new Map(SHELF_FIXTURE.products.map((p) => [subject.idOf(p.key), p.key]));
      return ids.flatMap((id) => keyById.get(id) ?? []);
    };

    it("lists featured products that are for sale, newest first", async () => {
      const sub = await subject();
      const featured = await sub.repo.listFeatured(100);
      expect(fixtureKeys(featured.map((p) => p.id), sub)).toEqual(["charlie", "alpha"]);
    });

    it("ranks best sellers by units sold in placed, dispatched and delivered orders, ties by name", async () => {
      const sub = await subject();
      const best = await sub.repo.listBestSellers({ since: bestSellerSince(sub.now), soldStatuses: SOLD_ORDER_STATUSES, limit: 100 });
      // alpha 2+2, bravo 3 (the unpaid 5 don't count), charlie 3 (cancelled and 120-day-old orders don't).
      expect(fixtureKeys(best.map((p) => p.id), sub)).toEqual(["alpha", "bravo", "charlie"]);
    });

    it("counts only orders inside the window", async () => {
      const sub = await subject();
      const best = await sub.repo.listBestSellers({ since: bestSellerSince(sub.now, 7), soldStatuses: SOLD_ORDER_STATUSES, limit: 100 });
      // The delivered order 20 days ago drops out: alpha has 2 left.
      expect(fixtureKeys(best.map((p) => p.id), sub)).toEqual(["bravo", "charlie", "alpha"]);
    });

    it("respects the limit", async () => {
      const sub = await subject();
      expect((await sub.repo.listFeatured(1)).length).toBeLessThanOrEqual(1);
      expect((await sub.repo.listBestSellers({ since: bestSellerSince(sub.now), soldStatuses: SOLD_ORDER_STATUSES, limit: 1 })).length).toBeLessThanOrEqual(1);
    });
  });
}

export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
