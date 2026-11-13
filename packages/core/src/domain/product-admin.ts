import { z } from "zod";
import type { Category } from "./category";
import { ProductSchema, SlugSchema, type ProductStatus } from "./product";

// Admin catalogue editing (ADR-016). The storefront's Product type stays read-only; admins work on
// AdminProduct, which adds an opaque version token for optimistic concurrency.

// ₹10,00,000 in paise: far above any ToyNest price, so a slipped extra digit is caught.
export const MAX_PRICE_MINOR = 10_00_000_00;

const attributeValue = z.string().trim().min(1).max(100);

// What an admin may set. Status is not here: it changes only through publish/unpublish/archive/restore.
export const ProductInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  slug: SlugSchema.max(80),
  description: z.string().trim().max(5000),
  categoryId: z.uuid("Choose a category"),
  priceMinor: z.number().int().nonnegative().max(MAX_PRICE_MINOR),
  // Category attributes such as { ageRange: "3-5 years" }. Empty values are dropped before parsing.
  attributes: z.record(z.string().min(1).max(40), attributeValue),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;

export const AdminProductSchema = ProductSchema.extend({
  // The row's updated_at exactly as the database returned it (microsecond precision). It is compared,
  // never parsed: a JS Date keeps only milliseconds and would never match.
  version: z.string().min(1),
  updatedAt: z.iso.datetime(),
});

export type AdminProduct = z.infer<typeof AdminProductSchema>;

// "Wooden Name Puzzle!" → "wooden-name-puzzle". Accents are folded; anything else non-alphanumeric
// becomes a single hyphen.
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

// Admins type rupees ("1,299" or "1299.50"); the domain stores paise. Integer arithmetic only, so
// "0.29" is 29 paise and never 28.999… Returns null for anything that isn't a valid amount.
export function parseRupees(text: string): number | null {
  const cleaned = text.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, rupees = "0", paise = ""] = match;
  const minor = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  return minor <= MAX_PRICE_MINOR ? minor : null;
}

// Paise → the plain number an admin edits ("1299" or "1299.50"), no symbol or grouping.
export function formatRupeesInput(minor: number): string {
  const rupees = Math.floor(minor / 100);
  const paise = minor % 100;
  return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, "0")}`;
}

// A draft may be incomplete; a product shoppers can see may not. Returns what is missing (empty = ok).
export function checkPublishable(product: Pick<ProductInput, "priceMinor" | "attributes">, category: Category): string[] {
  const problems: string[] = [];
  if (product.priceMinor <= 0) problems.push("Set a price above ₹0");
  for (const name of category.requiredAttributes) {
    if (!product.attributes[name]?.trim()) problems.push(`Fill in "${attributeLabel(name)}" (required for ${category.name})`);
  }
  return problems;
}

// "ageRange" → "Age range". Used for form labels and messages.
export function attributeLabel(name: string): string {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type StatusAction = "publish" | "unpublish" | "archive" | "restore";

// Allowed moves. Restoring goes back to draft, so an archived product is re-checked before it is live.
export const STATUS_TRANSITIONS: Record<StatusAction, { from: ProductStatus[]; to: ProductStatus }> = {
  publish: { from: ["draft"], to: "active" },
  unpublish: { from: ["active"], to: "draft" },
  archive: { from: ["draft", "active"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};
