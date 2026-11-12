import { z } from "zod";

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase words joined by single hyphens");

export const ProductStatusSchema = z.enum(["draft", "active", "archived"]);

// Money is held in minor units (paise; ₹1 = 100 paise) to avoid floating-point rounding.
export const ProductSchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(5000),
  categoryId: z.uuid(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: ProductStatusSchema,
  // Category attributes such as { ageRange: "3-5 years", material: "Wood" }.
  attributes: z.record(z.string(), z.string()),
  createdAt: z.iso.datetime(),
});

// "relevance" only differs from "name" when there is search text.
export const ProductSortSchema = z.enum(["relevance", "price-asc", "price-desc", "newest", "name"]);

export type Product = z.infer<typeof ProductSchema>;
export type ProductSort = z.infer<typeof ProductSortSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
