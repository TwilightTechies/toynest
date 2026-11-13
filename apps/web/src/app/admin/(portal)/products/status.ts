import type { ProductStatus } from "@toynest/core";

// "active" is called "Live" in the admin UI: it's what shoppers can see.
export const statusLabel: Record<ProductStatus, string> = { draft: "Draft", active: "Live", archived: "Archived" };
export const statusTone = (status: ProductStatus): "sage" | "neutral" => (status === "active" ? "sage" : "neutral");
