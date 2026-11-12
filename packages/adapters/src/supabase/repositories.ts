import type {
  CategoryRepository,
  Customer,
  CustomerRepository,
  OrderRepository,
  ProductRepository,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import {
  CATEGORY_COLUMNS,
  CUSTOMER_COLUMNS,
  ORDER_COLUMNS,
  PRODUCT_COLUMNS,
  SearchRowSchema,
  toCategory,
  toCustomer,
  toOrder,
  toProduct,
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
  };
}
