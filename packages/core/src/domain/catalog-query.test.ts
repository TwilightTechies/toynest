import { describe, expect, it } from "vitest";
import { catalogSearchString, parseCatalogParams } from "./catalog-query";

describe("parseCatalogParams", () => {
  it("returns defaults for an empty query string", () => {
    expect(parseCatalogParams({})).toEqual({
      text: "",
      categorySlug: undefined,
      sort: "relevance",
      minPriceMinor: undefined,
      maxPriceMinor: undefined,
      page: 1,
    });
  });

  it("converts rupees to paise and keeps valid values", () => {
    expect(
      parseCatalogParams({ q: " wood ", category: "stationery", sort: "price-asc", min: "249.5", max: "500", page: "2" }),
    ).toEqual({
      text: "wood",
      categorySlug: "stationery",
      sort: "price-asc",
      minPriceMinor: 24950,
      maxPriceMinor: 50000,
      page: 2,
    });
  });

  it("falls back to defaults for malformed values instead of throwing", () => {
    const params = parseCatalogParams({
      q: "x".repeat(500),
      category: "Not A Slug!",
      sort: "cheapest",
      min: "abc",
      max: "-5",
      page: "-3",
    });
    expect(params).toEqual({
      text: "",
      categorySlug: undefined,
      sort: "relevance",
      minPriceMinor: undefined,
      maxPriceMinor: undefined,
      page: 1,
    });
  });

  it("rejects prices with more than two decimals or above the ₹10,00,000 cap", () => {
    expect(parseCatalogParams({ min: "9.999", max: "2000000" })).toMatchObject({
      minPriceMinor: undefined,
      maxPriceMinor: undefined,
    });
  });

  it("swaps inverted price bounds", () => {
    expect(parseCatalogParams({ min: "2000", max: "500" })).toMatchObject({ minPriceMinor: 50000, maxPriceMinor: 200000 });
  });

  it("takes the first value of a repeated key", () => {
    expect(parseCatalogParams({ sort: ["newest", "name"], page: ["3", "9"] })).toMatchObject({
      sort: "newest",
      page: 3,
    });
  });
});

describe("catalogSearchString", () => {
  it("omits defaults and round-trips through the parser", () => {
    const params = parseCatalogParams({ category: "stationery", sort: "newest", min: "249.50", page: "2" });
    const text = catalogSearchString(params);
    expect(text).toBe("?category=stationery&sort=newest&min=249.50&page=2");
    expect(parseCatalogParams(Object.fromEntries(new URLSearchParams(text)))).toEqual(params);
  });

  it("applies overrides, e.g. a different page", () => {
    expect(catalogSearchString(parseCatalogParams({ q: "wood" }), { page: 3 })).toBe("?q=wood&page=3");
    expect(catalogSearchString(parseCatalogParams({}))).toBe("");
  });
});
