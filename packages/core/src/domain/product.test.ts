import { describe, expect, it } from "vitest";
import { ProductSchema, SlugSchema } from "./product";

const validProduct = {
  id: "7f1c2a4e-3b5d-4c6e-8f90-1a2b3c4d5e6f",
  slug: "wooden-alphabet-puzzle",
  name: "Wooden Alphabet Puzzle",
  description: "Colourful wooden alphabet puzzle.",
  categoryId: "0e9d8c7b-6a5f-4e3d-9c2b-1a0f9e8d7c6b",
  priceMinor: 1499,
  currency: "GBP",
  status: "active",
};

describe("SlugSchema", () => {
  it.each(["teds-train", "abc-blocks-large", "puzzle"])("accepts %s", (slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(["Teds-Train", "ted's-train", "double--hyphen", "-leading", "trailing-"])("rejects %s", (slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("ProductSchema", () => {
  it("accepts a valid product", () => {
    expect(ProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("rejects fractional or negative prices", () => {
    expect(ProductSchema.safeParse({ ...validProduct, priceMinor: 14.99 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...validProduct, priceMinor: -1 }).success).toBe(false);
  });

  it("rejects unknown status values", () => {
    expect(ProductSchema.safeParse({ ...validProduct, status: "deleted" }).success).toBe(false);
  });
});
