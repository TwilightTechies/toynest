import { z } from "zod";
import type { Product } from "./product";

// Indian PIN code: 6 digits, the first is 1-9.
export const PincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode");

// What gets engraved. Letters (any script), spaces and . ' - ; starts with a letter; 1-20 characters.
export const PersonalisationNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(20, "Names can be up to 20 characters")
  .regex(/^\p{L}[\p{L} .'-]*$/u, "Use letters, spaces, full stops, apostrophes or hyphens");

export const MAX_LINE_QUANTITY = 10;
export const QuantitySchema = z.number().int().min(1).max(MAX_LINE_QUANTITY);

export const CartLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  quantity: QuantitySchema,
  personalisationName: PersonalisationNameSchema.nullable(),
});

// No prices here on purpose: a basket is priced from the current product rows every time it is
// shown (priceCart). Prices are frozen only when an order is placed.
export const CartSchema = z.object({
  id: z.uuid(),
  pincode: PincodeSchema.nullable(),
  lines: z.array(CartLineSchema),
});

export type CartLine = z.infer<typeof CartLineSchema>;
export type Cart = z.infer<typeof CartSchema>;

// Personalisation is data, not code: a product whose attributes say personalisation = "name"
// needs a name; every other product must not get one.
export function isPersonalisable(product: Pick<Product, "attributes">): boolean {
  return product.attributes.personalisation === "name";
}

export type PersonalisationResult = { ok: true; name: string | null } | { ok: false; error: string };

export function validatePersonalisation(
  product: Pick<Product, "attributes">,
  rawName: string | null | undefined,
): PersonalisationResult {
  const given = rawName?.trim() ? rawName : null;
  if (!isPersonalisable(product)) {
    return given === null ? { ok: true, name: null } : { ok: false, error: "This product can't be personalised." };
  }
  const parsed = PersonalisationNameSchema.safeParse(given ?? "");
  return parsed.success ? { ok: true, name: parsed.data } : { ok: false, error: parsed.error.issues[0]!.message };
}
