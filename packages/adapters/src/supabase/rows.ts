import {
  AdminProductSchema,
  CartSchema,
  CategorySchema,
  CustomerSchema,
  OrderSchema,
  ProductSchema,
  ShippingZoneSchema,
  type AdminProduct,
  type Cart,
  type Category,
  type Customer,
  type Order,
  type Product,
  type ShippingZone,
} from "@toynest/core";
import { z } from "zod";

// Every row is validated on the way out of the database (an external boundary), then mapped to
// the domain type and validated again, so a schema drift fails loudly in the adapter.

// Postgres returns "2026-10-29T09:12:00+00:00"; the domain uses UTC ISO strings ("...Z").
const toIsoUtc = (value: string) => new Date(value).toISOString();

export const PRODUCT_COLUMNS =
  "id, slug, name, description, category_id, price_minor, currency, status, attributes, created_at";

export const ProductRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category_id: z.string(),
  price_minor: z.number().int(),
  currency: z.string(),
  status: z.string(),
  // jsonb: only string values are shown on the storefront; anything else is schema drift.
  attributes: z.record(z.string(), z.string()),
  created_at: z.string(),
});

export const SearchRowSchema = ProductRowSchema.extend({ total_count: z.coerce.number().int() });

export function toProduct(row: unknown): Product {
  const r = ProductRowSchema.parse(row);
  return ProductSchema.parse({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    categoryId: r.category_id,
    priceMinor: r.price_minor,
    currency: r.currency,
    status: r.status,
    attributes: r.attributes,
    createdAt: toIsoUtc(r.created_at),
  });
}

// Admin view: the same row plus updated_at, kept verbatim as the optimistic-concurrency version.
export const ADMIN_PRODUCT_COLUMNS = `${PRODUCT_COLUMNS}, updated_at`;

export function toAdminProduct(row: unknown): AdminProduct {
  const updatedAt = z.object({ updated_at: z.string().min(1) }).parse(row).updated_at;
  return AdminProductSchema.parse({ ...toProduct(row), version: updatedAt, updatedAt: toIsoUtc(updatedAt) });
}

export const CATEGORY_COLUMNS = "id, slug, name, required_attributes";

const CategoryRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  required_attributes: z.array(z.string()),
});

export function toCategory(row: unknown): Category {
  const r = CategoryRowSchema.parse(row);
  return CategorySchema.parse({ id: r.id, slug: r.slug, name: r.name, requiredAttributes: r.required_attributes });
}

export const CUSTOMER_COLUMNS = "id, name, email";

export function toCustomer(row: unknown): Customer {
  return CustomerSchema.parse(z.object({ id: z.string(), name: z.string(), email: z.string() }).parse(row));
}

// Order with its items embedded (PostgREST resource embedding over the order_items foreign key).
export const ORDER_COLUMNS =
  "order_number, customer_id, status, placed_at, delivered_at, total_minor, refunded_minor, currency, " +
  "order_items(product_slug, product_name, quantity, unit_price_minor, created_at)";

const OrderRowSchema = z.object({
  order_number: z.string(),
  customer_id: z.string(),
  status: z.string(),
  placed_at: z.string(),
  delivered_at: z.string().nullable(),
  total_minor: z.number().int(),
  refunded_minor: z.number().int(),
  currency: z.string(),
  order_items: z.array(
    z.object({
      product_slug: z.string(),
      product_name: z.string(),
      quantity: z.number().int(),
      unit_price_minor: z.number().int(),
      created_at: z.string(),
    }),
  ),
});

export function toOrder(row: unknown): Order {
  const r = OrderRowSchema.parse(row);
  return OrderSchema.parse({
    id: r.order_number,
    customerId: r.customer_id,
    status: r.status,
    placedAt: toIsoUtc(r.placed_at),
    deliveredAt: r.delivered_at === null ? null : toIsoUtc(r.delivered_at),
    totalMinor: r.total_minor,
    refundedMinor: r.refunded_minor,
    currency: r.currency,
    items: [...r.order_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        productSlug: item.product_slug,
        name: item.product_name,
        quantity: item.quantity,
        unitPriceMinor: item.unit_price_minor,
      })),
  });
}

// Basket with its lines embedded (PostgREST resource embedding over cart_items.cart_id).
export const CART_COLUMNS = "id, pincode, cart_items(id, product_id, quantity, personalisation_name, created_at)";

const CartRowSchema = z.object({
  id: z.string(),
  pincode: z.string().nullable(),
  cart_items: z.array(
    z.object({
      id: z.string(),
      product_id: z.string(),
      quantity: z.number().int(),
      personalisation_name: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});

export function toCart(row: unknown): Cart {
  const r = CartRowSchema.parse(row);
  return CartSchema.parse({
    id: r.id,
    pincode: r.pincode,
    // Oldest line first, so the basket keeps the order things were added in.
    lines: [...r.cart_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        personalisationName: item.personalisation_name,
      })),
  });
}

export const SHIPPING_ZONE_COLUMNS = "id, slug, name, fee_minor, free_over_minor, pincode_prefixes, is_default";

const ShippingZoneRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  fee_minor: z.number().int(),
  free_over_minor: z.number().int().nullable(),
  pincode_prefixes: z.array(z.string()),
  is_default: z.boolean(),
});

export function toShippingZone(row: unknown): ShippingZone {
  const r = ShippingZoneRowSchema.parse(row);
  return ShippingZoneSchema.parse({
    id: r.id,
    slug: r.slug,
    name: r.name,
    feeMinor: r.fee_minor,
    freeOverMinor: r.free_over_minor,
    pincodePrefixes: r.pincode_prefixes,
    isDefault: r.is_default,
  });
}
