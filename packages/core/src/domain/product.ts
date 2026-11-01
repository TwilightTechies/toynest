import { z } from "zod";

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase words joined by single hyphens");

export const ProductStatusSchema = z.enum(["draft", "active", "archived"]);

// Money is held in minor units (e.g. pence) to avoid floating-point rounding.
export const ProductSchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(5000),
  categoryId: z.uuid(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: ProductStatusSchema,
});

export type Product = z.infer<typeof ProductSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
