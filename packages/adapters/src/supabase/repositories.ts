import type {
  CartRepository,
  CategoryRepository,
  Customer,
  CustomerRepository,
  OrderRepository,
  ProductRepository,
  ShippingZoneRepository,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import {
  CART_COLUMNS,
  CATEGORY_COLUMNS,
  CUSTOMER_COLUMNS,
  ORDER_COLUMNS,
  PRODUCT_COLUMNS,
  SearchRowSchema,
  SHIPPING_ZONE_COLUMNS,
  toCart,
  toCategory,
  toCustomer,
  toOrder,
  toProduct,
  toShippingZone,
} from "./rows";

const isUuid = (value: string) => z.uuid().safeParse(value).success;
const isOrderNumber = (value: string) => /^TN-\d{4}$/.test(value);

export function createSupabaseProductRepository(client: SupabaseClient): ProductRepository {
  return {
    async findBySlug(slug) {
      const result = await client.from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
      if (result.error) throw toRepositoryError(result, "products.findBySlug");
      return result.data ? toProduct(result.data) : null;
    },
    async findByIds(ids) {
      const valid = ids.filter(isUuid);
      if (valid.length === 0) return [];
      const result = await client.from("products").select(PRODUCT_COLUMNS).in("id", valid);
      if (result.error) throw toRepositoryError(result, "products.findByIds");
      return z.array(z.unknown()).parse(result.data).map(toProduct);
    },
    async search({ text, categoryId, minPriceMinor, maxPriceMinor, sort = "relevance", limit, offset }) {
      const result = await client.rpc("search_products", {
        search_text: text?.trim() || null,
        category: categoryId ?? null,
        page_limit: limit,
        page_offset: offset,
        sort_by: sort,
        min_price: minPriceMinor ?? null,
        max_price: maxPriceMinor ?? null,
      });
      if (result.error) throw toRepositoryError(result, "products.search");
      const rows = z.array(SearchRowSchema).parse(result.data);
      // total_count is the full match count (window function), repeated on every row.
      return { items: rows.map(toProduct), total: rows[0]?.total_count ?? 0 };
    },
  };
}

export function createSupabaseCategoryRepository(client: SupabaseClient): CategoryRepository {
  return {
    async list() {
      const result = await client.from("categories").select(CATEGORY_COLUMNS).order("name");
      if (result.error) throw toRepositoryError(result, "categories.list");
      return z.array(z.unknown()).parse(result.data).map(toCategory);
    },
  };
}

// Baskets. The cart id is the secret from the shopper's cookie: every query filters by it, and a
// line id is only ever changed together with its cart id (a line from another cart = not found).
export function createSupabaseCartRepository(client: SupabaseClient): CartRepository {
  const read = async (cartId: string) => {
    if (!isUuid(cartId)) return null;
    const result = await client.from("carts").select(CART_COLUMNS).eq("id", cartId).maybeSingle();
    if (result.error) throw toRepositoryError(result, "carts.get");
    return result.data ? toCart(result.data) : null;
  };

  return {
    async create() {
      const result = await client.from("carts").insert({}).select(CART_COLUMNS).single();
      if (result.error) throw toRepositoryError(result, "carts.create");
      return toCart(result.data);
    },
    get: read,
    async addLine(cartId, { productId, personalisationName, quantity }) {
      // Atomic insert-or-increment in SQL (add_cart_line), capped at 10.
      const result = await client.rpc("add_cart_line", {
        cart: cartId,
        product: productId,
        personalisation: personalisationName,
        add_quantity: quantity,
      });
      if (result.error) throw toRepositoryError(result, "carts.addLine");
    },
    async setQuantity(cartId, lineId, quantity) {
      if (!isUuid(cartId) || !isUuid(lineId)) return false;
      const result = await client
        .from("cart_items")
        .update({ quantity })
        .eq("cart_id", cartId)
        .eq("id", lineId)
        .select("id");
      if (result.error) throw toRepositoryError(result, "carts.setQuantity");
      return z.array(z.unknown()).parse(result.data).length === 1;
    },
    async removeLine(cartId, lineId) {
      if (!isUuid(cartId) || !isUuid(lineId)) return false;
      const result = await client.from("cart_items").delete().eq("cart_id", cartId).eq("id", lineId).select("id");
      if (result.error) throw toRepositoryError(result, "carts.removeLine");
      return z.array(z.unknown()).parse(result.data).length === 1;
    },
    async setPincode(cartId, pincode) {
      if (!isUuid(cartId)) return;
      const result = await client.from("carts").update({ pincode }).eq("id", cartId);
      if (result.error) throw toRepositoryError(result, "carts.setPincode");
    },
  };
}

export function createSupabaseShippingZoneRepository(client: SupabaseClient): ShippingZoneRepository {
  return {
    async list() {
      const result = await client.from("shipping_zones").select(SHIPPING_ZONE_COLUMNS).order("name");
      if (result.error) throw toRepositoryError(result, "shippingZones.list");
      return z.array(z.unknown()).parse(result.data).map(toShippingZone);
    },
  };
}

export function createSupabaseCustomerRepository(client: SupabaseClient): CustomerRepository {
  return {
    async findById(id) {
      if (!isUuid(id)) return null;
      const result = await client.from("customers").select(CUSTOMER_COLUMNS).eq("id", id).maybeSingle();
      if (result.error) throw toRepositoryError(result, "customers.findById");
      return result.data ? toCustomer(result.data) : null;
    },
  };
}

// Isolation layer 3: every query is filtered by the customer id passed in from the session.
// With a user-scoped client, RLS (layer 4) also applies, so even a wrong customer id cannot leak rows.
export function createSupabaseOrderRepository(client: SupabaseClient): OrderRepository {
  return {
    async findForCustomer(customerId, orderId) {
      if (!isUuid(customerId) || !isOrderNumber(orderId)) return null;
      const result = await client
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("customer_id", customerId)
        .eq("order_number", orderId)
        .maybeSingle();
      if (result.error) throw toRepositoryError(result, "orders.findForCustomer");
      return result.data ? toOrder(result.data) : null;
    },
    async listForCustomer(customerId, limit) {
      if (!isUuid(customerId)) return [];
      const result = await client
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("customer_id", customerId)
        .order("placed_at", { ascending: false })
        .limit(limit);
      if (result.error) throw toRepositoryError(result, "orders.listForCustomer");
      return z.array(z.unknown()).parse(result.data).map(toOrder);
    },
  };
}

// Demo-only helper for the mock sign-in list (not a core port).
export async function listDemoCustomers(client: SupabaseClient, limit = 10): Promise<Customer[]> {
  const result = await client.from("customers").select(CUSTOMER_COLUMNS).order("name").limit(limit);
  if (result.error) throw toRepositoryError(result, "customers.listDemo");
  return z.array(z.unknown()).parse(result.data).map(toCustomer);
}

export function createSupabaseRepositories(client: SupabaseClient) {
  return {
    products: createSupabaseProductRepository(client),
    categories: createSupabaseCategoryRepository(client),
    customers: createSupabaseCustomerRepository(client),
    orders: createSupabaseOrderRepository(client),
    carts: createSupabaseCartRepository(client),
    shippingZones: createSupabaseShippingZoneRepository(client),
  };
}
