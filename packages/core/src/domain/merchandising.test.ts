import { describe, expect, it } from "vitest";
import { bestSellerSince, isSoldStatus, shelfOrEmpty, SOLD_ORDER_STATUSES } from "./merchandising";
import { OrderStatusSchema } from "./order";

describe("what counts as sold", () => {
  it("counts placed, dispatched and delivered orders, including Cash on Delivery (placed at once)", () => {
    expect(isSoldStatus("placed")).toBe(true);
    expect(isSoldStatus("dispatched")).toBe(true);
    expect(isSoldStatus("delivered")).toBe(true);
  });

  it("leaves out unpaid or failed online payments and cancelled orders", () => {
    expect(isSoldStatus("awaiting_payment")).toBe(false);
    expect(isSoldStatus("cancelled")).toBe(false);
  });

  it("only names real order statuses", () => {
    for (const status of SOLD_ORDER_STATUSES) expect(OrderStatusSchema.safeParse(status).success).toBe(true);
  });
});

describe("bestSellerSince", () => {
  it("goes back 90 days by default", () => {
    expect(bestSellerSince(new Date("2026-11-19T10:00:00.000Z"))).toBe("2026-08-21T10:00:00.000Z");
  });

  it("takes another window", () => {
    expect(bestSellerSince(new Date("2026-11-19T10:00:00.000Z"), 7)).toBe("2026-11-12T10:00:00.000Z");
  });
});

describe("shelfOrEmpty", () => {
  it("hides a shelf below the minimum and keeps it at or above", () => {
    expect(shelfOrEmpty(["a"], 2)).toEqual([]);
    expect(shelfOrEmpty(["a", "b"], 2)).toEqual(["a", "b"]);
    expect(shelfOrEmpty([], 1)).toEqual([]);
  });
});
