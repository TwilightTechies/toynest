import { z } from "zod";
import { SlugSchema } from "./product";

export const CategorySchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1),
  // Attribute names every product in this category must state, e.g. "ageRange".
  requiredAttributes: z.array(z.string().min(1)),
  // "Show in shop" (ADR-018). A hidden category hides all its products from the shop, without
  // changing their status, so a seasonal range can be switched off and on again in one step.
  visible: z.boolean(),
  // Menu and filter order, lowest first; ties by name.
  sortOrder: z.number().int(),
  // Short label for the header menu ("Christmas"); the name is used when absent.
  menuLabel: z.string().min(1).max(30).nullable(),
});

export type Category = z.infer<typeof CategorySchema>;

export const menuLabelOf = (category: Pick<Category, "name" | "menuLabel">) => category.menuLabel ?? category.name;
