import type { InventoryRepository, Stock } from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";

const StockRowSchema = z.object({ id: z.string(), stock: z.number().int().min(0).nullable() });

// Stock levels for the shop (ADR-023): product detail, basket warnings. Read-only.
export function createSupabaseInventoryRepository(client: SupabaseClient): InventoryRepository {
  return {
    async levels(productIds) {
      const ids = [...new Set(productIds)].filter((id) => z.uuid().safeParse(id).success);
      if (ids.length === 0) return new Map<string, Stock>();
      const result = await client.from("products").select("id, stock").in("id", ids);
      if (result.error) throw toRepositoryError(result, "inventory.levels");
      return new Map(z.array(StockRowSchema).parse(result.data).map((row) => [row.id, row.stock]));
    },
  };
}
