import { z } from "zod";
import { SlugSchema } from "./product";

export const CategorySchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1),
  // Attribute names every product in this category must state, e.g. "ageRange".
  requiredAttributes: z.array(z.string().min(1)),
});

export type Category = z.infer<typeof CategorySchema>;
