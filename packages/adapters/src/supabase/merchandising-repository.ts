import type { MerchandisingRepository } from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import { PRODUCT_COLUMNS, toProduct } from "./rows";

// Home-page shelves (ADR-021). Every row is still checked with Zod (toProduct): the database
// guarantees column types, but the boundary rule is to validate what comes back anyway.
export function createSupabaseMerchandisingRepository(client: SupabaseClient): MerchandisingRepository {
  return {
    async listFeatured(limit) {
      // categories!inner turns the embed into an inner join, so the visible filter drops products in
      // hidden categories (the app reads with the service role, which bypasses the RLS that would
      // otherwise do this; ADR-018).
      const result = await client
        .from("products")
        .select(`${PRODUCT_COLUMNS}, categories!inner(visible)`)
        .eq("featured", true)
        .eq("status", "active")
        .eq("categories.visible", true)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(limit);
      if (result.error) throw toRepositoryError(result, "merchandising.listFeatured");
      return z.array(z.unknown()).parse(result.data).map(toProduct);
    },

    async listBestSellers({ since, soldStatuses, limit }) {
      const result = await client.rpc("best_selling_products", {
        since,
        sold_statuses: [...soldStatuses],
        page_limit: limit,
      });
      if (result.error) throw toRepositoryError(result, "merchandising.listBestSellers");
      return z.array(z.unknown()).parse(result.data).map(toProduct);
    },
  };
}
