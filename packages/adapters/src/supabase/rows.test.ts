import { describe, expect, it } from "vitest";
import { toCategory, toOrder, toProduct } from "./rows";

const productRow = {
  id: "7f1c2a4e-3b5d-4c6e-8f90-1a2b3c4d5e6f",
  slug: "wooden-number-puzzle",
  name: "Wooden Number Puzzle",
  description: "Wooden Number Puzzle. Ages 3-5 years. Material: Wood.",
  category_id: "0e9d8c7b-6a5f-4e3d-9c2b-1a0f9e8d7c6b",
  price_minor: 1299,
  currency: "GBP",
  status: "active",
  attributes: { ageRange: "3-5 years", material: "Wood" },
  created_at: "2026-08-04T00:00:00+00:00",
};

const orderRow = {
  order_number: "TN-1042",
  customer_id: "3b9a1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  status: "delivered",
  placed_at: "2026-10-29T09:12:00+00:00",
  delivered_at: "2026-11-02T14:05:00+00:00",
  total_minor: 4249,
  refunded_minor: 0,
  currency: "GBP",
  order_items: [
    { product_slug: "magnetic-letter-board", product_name: "Magnetic Letter Board", quantity: 1, unit_price_minor: 1750, created_at: "2026-10-29T09:12:02+00:00" },
    { product_slug: "personalised-name-train", product_name: "Personalised Name Train", quantity: 1, unit_price_minor: 2499, created_at: "2026-10-29T09:12:01+00:00" },
  ],
};

describe("toProduct", () => {
  it("maps snake_case columns to the domain product", () => {
    expect(toProduct(productRow)).toMatchObject({ categoryId: productRow.category_id, priceMinor: 1299, status: "active" });
  });

  it("maps attributes and normalises created_at to UTC ISO", () => {
    expect(toProduct(productRow)).toMatchObject({
      attributes: { ageRange: "3-5 years", material: "Wood" },
      createdAt: "2026-08-04T00:00:00.000Z",
    });
  });

  it("rejects non-string attribute values (jsonb drift)", () => {
    expect(() => toProduct({ ...productRow, attributes: { ageRange: 3 } })).toThrow();
  });

  it("rejects a row whose price is not integer pence", () => {
    expect(() => toProduct({ ...productRow, price_minor: 12.99 })).toThrow();
  });

  it("rejects an unknown status (schema drift fails loudly)", () => {
    expect(() => toProduct({ ...productRow, status: "deleted" })).toThrow();
  });
});

describe("toCategory", () => {
  it("maps required_attributes", () => {
    const category = toCategory({ id: productRow.category_id, slug: "stationery", name: "Stationery", required_attributes: ["material"] });
    expect(category.requiredAttributes).toEqual(["material"]);
  });
});

describe("toOrder", () => {
  it("uses order_number as the domain order id", () => {
    expect(toOrder(orderRow).id).toBe("TN-1042");
  });

  it("normalises Postgres timestamps to UTC ISO strings", () => {
    const order = toOrder(orderRow);
    expect(order.placedAt).toBe("2026-10-29T09:12:00.000Z");
    expect(order.deliveredAt).toBe("2026-11-02T14:05:00.000Z");
  });

  it("keeps order lines in the order they were created", () => {
    expect(toOrder(orderRow).items.map((item) => item.productSlug)).toEqual(["personalised-name-train", "magnetic-letter-board"]);
  });

  it("rejects an order with no lines", () => {
    expect(() => toOrder({ ...orderRow, order_items: [] })).toThrow();
  });
});
