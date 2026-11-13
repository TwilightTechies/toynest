import { z } from "zod";
import { CategorySchema } from "./category";
import { SlugSchema } from "./product";

// Category editing (ADR-018).

export const MAX_REQUIRED_ATTRIBUTES = 10;

// "Learning focus" → "learningFocus" (the inverse of attributeLabel). Keys are what product
// attributes are stored under, so they must stay stable once products use them.
export function attributeKey(label: string): string {
  const words = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join("");
}

const AttributeKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, "Use letters and numbers for detail names");

export const CategoryInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  slug: SlugSchema.max(60),
  // Empty means "use the name".
  menuLabel: z.string().trim().max(30, "Keep the menu label under 30 characters").nullable(),
  requiredAttributes: z
    .array(AttributeKeySchema)
    .max(MAX_REQUIRED_ATTRIBUTES, `At most ${MAX_REQUIRED_ATTRIBUTES} required details`)
    .refine((keys) => new Set(keys).size === keys.length, "Each required detail can appear only once"),
});

export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const AdminCategorySchema = CategorySchema.extend({
  // Raw updated_at as the database returned it: an opaque optimistic-concurrency token (ADR-016).
  version: z.string().min(1),
  // Products of any status in this category (a category in use can't be deleted).
  productCount: z.number().int().nonnegative(),
});

export type AdminCategory = z.infer<typeof AdminCategorySchema>;

// Comma- or line-separated labels from the form ("Age range, Material") → unique keys.
export function parseRequiredAttributes(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((label) => attributeKey(label)).filter(Boolean))];
}
