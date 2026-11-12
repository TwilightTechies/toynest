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

  it("converts pounds to pence and keeps valid values", () => {
    expect(
      parseCatalogParams({ q: " wood ", category: "stationery", sort: "price-asc", min: "4.5", max: "10", page: "2" }),
    ).toEqual({
      text: "wood",
      categorySlug: "stationery",
      sort: "price-asc",
      minPriceMinor: 450,
      maxPriceMinor: 1000,
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

  it("rejects prices with more than two decimals or above the cap", () => {
    expect(parseCatalogParams({ min: "9.999", max: "99999" })).toMatchObject({
      minPriceMinor: undefined,
      maxPriceMinor: undefined,
    });
  });

  it("swaps inverted price bounds", () => {
    expect(parseCatalogParams({ min: "20", max: "5" })).toMatchObject({ minPriceMinor: 500, maxPriceMinor: 2000 });
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
    const params = parseCatalogParams({ category: "stationery", sort: "newest", min: "4.50", page: "2" });
    const text = catalogSearchString(params);
    expect(text).toBe("?category=stationery&sort=newest&min=4.50&page=2");
    expect(parseCatalogParams(Object.fromEntries(new URLSearchParams(text)))).toEqual(params);
  });

  it("applies overrides, e.g. a different page", () => {
    expect(catalogSearchString(parseCatalogParams({ q: "wood" }), { page: 3 })).toBe("?q=wood&page=3");
    expect(catalogSearchString(parseCatalogParams({}))).toBe("");
  });
});
