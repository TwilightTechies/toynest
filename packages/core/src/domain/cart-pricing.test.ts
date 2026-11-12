import { describe, expect, it } from "vitest";
import type { CartLine } from "./cart";
import { priceCart } from "./cart-pricing";
import type { Product } from "./product";
import type { ShippingZone } from "./shipping";

const product = (n: number, priceMinor: number, status: Product["status"] = "active"): Product => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  slug: `product-${n}`,
  name: `Product ${n}`,
  description: "",
  categoryId: "20000000-0000-4000-8000-000000000001",
  priceMinor,
  currency: "INR",
  status,
  attributes: {},
  createdAt: "2026-10-01T00:00:00.000Z",
});

const line = (n: number, productNo: number, quantity: number): CartLine => ({
  id: `30000000-0000-4000-8000-00000000000${n}`,
  productId: product(productNo, 0).id,
  quantity,
  personalisationName: null,
});

const metro: ShippingZone = {
  id: "40000000-0000-4000-8000-000000000001",
  slug: "metro",
  name: "Metro",
  feeMinor: 4900,
  freeOverMinor: 49900,
  pincodePrefixes: ["560"],
  isDefault: false,
};

const crayons = product(1, 14900);
const puzzle = product(2, 59900);

describe("priceCart", () => {
  it("prices lines from the product rows and leaves delivery unknown without a zone", () => {
    const cart = priceCart({ lines: [line(1, 1, 2)], products: [crayons], zone: null });
    expect(cart).toMatchObject({ itemCount: 2, subtotalMinor: 29800, deliveryMinor: null, totalMinor: 29800 });
    expect(cart.lines[0]).toMatchObject({ status: "ok", unitPriceMinor: 14900, lineTotalMinor: 29800 });
  });

  it("charges the zone fee below the threshold and says how much more is needed", () => {
    const cart = priceCart({ lines: [line(1, 1, 2)], products: [crayons], zone: metro });
    expect(cart).toMatchObject({ deliveryMinor: 4900, freeDeliveryRemainingMinor: 20100, totalMinor: 34700 });
  });

  it("makes delivery free at exactly the threshold and above", () => {
    const atThreshold = { ...metro, freeOverMinor: 59900 };
    expect(priceCart({ lines: [line(1, 2, 1)], products: [puzzle], zone: atThreshold })).toMatchObject({
      deliveryMinor: 0,
      freeDeliveryRemainingMinor: null,
      totalMinor: 59900,
    });
  });

  it("never makes delivery free when the zone has no threshold", () => {
    const cart = priceCart({ lines: [line(1, 2, 3)], products: [puzzle], zone: { ...metro, freeOverMinor: null } });
    expect(cart).toMatchObject({ deliveryMinor: 4900, freeDeliveryRemainingMinor: null });
  });

  it("charges nothing for an empty basket", () => {
    expect(priceCart({ lines: [], products: [], zone: metro })).toMatchObject({ deliveryMinor: 0, totalMinor: 0 });
  });

  it("marks missing or inactive products unavailable and leaves them out of the totals", () => {
    const archived = product(3, 99900, "archived");
    const cart = priceCart({ lines: [line(1, 1, 1), line(2, 3, 1), line(3, 4, 1)], products: [crayons, archived], zone: null });
    expect(cart.lines.map((l) => l.status)).toEqual(["ok", "unavailable", "unavailable"]);
    expect(cart).toMatchObject({ itemCount: 1, subtotalMinor: 14900 });
  });
});
