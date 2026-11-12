import { z } from "zod";
import { ProductSortSchema, SlugSchema, type ProductSort } from "./product";

export const CATALOG_PAGE_SIZE = 6;
const MAX_PAGE = 1000;
const MAX_PRICE_MAJOR = 1_000_000; // ₹10,00,000

// What a shopper asked for, after validation. Unknown or malformed values fall back to "not set",
// so a hand-edited URL shows the default listing instead of an error page.
export interface CatalogParams {
  text: string;
  categorySlug: string | undefined;
  sort: ProductSort;
  minPriceMinor: number | undefined;
  maxPriceMinor: number | undefined;
  page: number;
}

// Next gives string | string[] | undefined per key; take the first value only.
const first = z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().optional());

// Shoppers type whole currency units ("500" or "499.50" rupees); the domain works in minor units
// (paise). Rounded so a float like 4.35 * 100 can't produce fractions.
const majorUnits = first.pipe(
  z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .transform(Number)
    .pipe(z.number().max(MAX_PRICE_MAJOR))
    .transform((value) => Math.round(value * 100))
    .optional()
    .catch(undefined),
);

const ParamsSchema = z.object({
  q: first.pipe(z.string().trim().max(100).catch("")).transform((value) => value ?? ""),
  category: first.pipe(SlugSchema.max(60).optional().catch(undefined)),
  sort: first.pipe(ProductSortSchema.optional().catch(undefined)),
  min: majorUnits,
  max: majorUnits,
  page: first.pipe(
    z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(1).max(MAX_PAGE)).optional().catch(undefined),
  ),
});

export function parseCatalogParams(searchParams: Record<string, string | string[] | undefined>): CatalogParams {
  const p = ParamsSchema.parse(searchParams);
  // A shopper who swaps the bounds still means "between these two prices".
  const [minPriceMinor, maxPriceMinor] =
    p.min !== undefined && p.max !== undefined && p.min > p.max ? [p.max, p.min] : [p.min, p.max];
  return {
    text: p.q,
    categorySlug: p.category,
    sort: p.sort ?? "relevance",
    minPriceMinor,
    maxPriceMinor,
    page: p.page ?? 1,
  };
}

// Turns validated params back into a query string, e.g. for pagination links. Defaults are omitted.
export function catalogSearchString(params: CatalogParams, overrides: Partial<CatalogParams> = {}): string {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();
  if (merged.text) query.set("q", merged.text);
  if (merged.categorySlug) query.set("category", merged.categorySlug);
  if (merged.sort !== "relevance") query.set("sort", merged.sort);
  if (merged.minPriceMinor !== undefined) query.set("min", formatMajorUnits(merged.minPriceMinor));
  if (merged.maxPriceMinor !== undefined) query.set("max", formatMajorUnits(merged.maxPriceMinor));
  if (merged.page > 1) query.set("page", String(merged.page));
  const text = query.toString();
  return text ? `?${text}` : "";
}

// 50000 -> "500", 49950 -> "499.50": the form shows what the shopper would have typed.
export function formatMajorUnits(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}
