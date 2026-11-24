import { describe, expect, it } from "vitest";
import { availability, checkStock, LOW_STOCK, parseStock } from "./inventory";

describe("availability", () => {
  it.each([
    [null, { kind: "untracked" }],
    [0, { kind: "sold_out" }],
    [1, { kind: "low", units: 1 }],
    [LOW_STOCK, { kind: "low", units: LOW_STOCK }],
    [LOW_STOCK + 1, { kind: "in_stock", units: LOW_STOCK + 1 }],
  ])("stock %j", (stock, expected) => expect(availability(stock)).toEqual(expected));
});

describe("parseStock", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["0", 0],
    ["12", 12],
    ["1,200", 1200],
    ["99999", 99999],
  ])("%j → %j", (text, stock) => expect(parseStock(text)).toEqual({ ok: true, stock }));

  it.each(["-1", "2.5", "abc", "1e3", "100000"])("rejects %j", (text) => expect(parseStock(text).ok).toBe(false));
});

describe("checkStock", () => {
  const levels = new Map<string, number | null>([
    ["tracked", 3],
    ["untracked", null],
    ["sold-out", 0],
  ]);

  it("passes when every tracked product has enough", () => {
    expect(checkStock([{ productId: "tracked", quantity: 3 }, { productId: "untracked", quantity: 10 }], levels)).toEqual([]);
  });

  it("sums the same product across lines (e.g. two different names)", () => {
    expect(checkStock([{ productId: "tracked", quantity: 2 }, { productId: "tracked", quantity: 2 }], levels)).toEqual([
      { productId: "tracked", available: 3, wanted: 4 },
    ]);
  });

  it("reports sold-out products and ignores unknown ones", () => {
    expect(checkStock([{ productId: "sold-out", quantity: 1 }, { productId: "missing", quantity: 1 }], levels)).toEqual([
      { productId: "sold-out", available: 0, wanted: 1 },
    ]);
  });
});
