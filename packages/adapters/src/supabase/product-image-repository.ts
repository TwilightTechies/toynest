import { randomUUID } from "node:crypto";
import {
  ConflictError,
  ProductImageSchema,
  type ProductImage,
  type ProductImageAdminRepository,
  type ProductImageRepository,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";

export const PRODUCT_IMAGES_BUCKET = "product-images";
// Files are immutable (a new upload always gets a new random path), so browsers and the CDN may keep
// them for a year. Repeat views then count as the cheaper "cached" egress.
const ONE_YEAR_SECONDS = "31536000";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

const IMAGE_COLUMNS = "id, product_id, path, alt, position, width, height";

const ImageRowSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  path: z.string().min(1),
  alt: z.string(),
  position: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
});

const fileFor = (path: string, size: "large" | "small") => `${path}-${size}.webp`;

// getPublicUrl only formats a string (no network call): <project>/storage/v1/object/public/<bucket>/<file>.
function toImage(client: SupabaseClient, row: unknown): ProductImage {
  const r = ImageRowSchema.parse(row);
  const bucket = client.storage.from(PRODUCT_IMAGES_BUCKET);
  return ProductImageSchema.parse({
    id: r.id,
    productId: r.product_id,
    alt: r.alt,
    position: r.position,
    width: r.width,
    height: r.height,
    urls: {
      large: bucket.getPublicUrl(fileFor(r.path, "large")).data.publicUrl,
      small: bucket.getPublicUrl(fileFor(r.path, "small")).data.publicUrl,
    },
  });
}

const isUuid = (value: string) => z.uuid().safeParse(value).success;

// Storefront reads (service-role client today, so the caller only asks for active products).
export function createSupabaseProductImageRepository(client: SupabaseClient): ProductImageRepository {
  return {
    async listForProducts(productIds) {
      const ids = productIds.filter(isUuid);
      const byProduct = new Map<string, ProductImage[]>();
      if (ids.length === 0) return byProduct;
      const result = await client.from("product_images").select(IMAGE_COLUMNS).in("product_id", ids).order("position");
      if (result.error) throw toRepositoryError(result, "productImages.listForProducts");
      for (const row of z.array(z.unknown()).parse(result.data)) {
        const image = toImage(client, row);
        byProduct.set(image.productId, [...(byProduct.get(image.productId) ?? []), image]);
      }
      return byProduct;
    },
  };
}

// ADR-017. Give it the admin's user-scoped client: Storage and table RLS (is_admin()) then check every
// upload, edit and delete independently of the app.
export function createSupabaseProductImageAdminRepository(client: SupabaseClient): ProductImageAdminRepository {
  const bucket = () => client.storage.from(PRODUCT_IMAGES_BUCKET);

  async function deleteFiles(path: string): Promise<void> {
    const { error } = await bucket().remove([fileFor(path, "large"), fileFor(path, "small")]);
    // The row is already gone, so the photo has disappeared from the shop; leftover files only cost
    // storage. Log for the orphan-cleanup job rather than failing the admin's request.
    if (error) console.error(`Orphaned product image files at ${path}: ${error.message}`);
  }

  return {
    async list(productId) {
      if (!isUuid(productId)) return [];
      const result = await client.from("product_images").select(IMAGE_COLUMNS).eq("product_id", productId).order("position");
      if (result.error) throw toRepositoryError(result, "productImages.list");
      return z.array(z.unknown()).parse(result.data).map((row) => toImage(client, row));
    },

    async add({ productId, alt, position, large, small }) {
      const id = randomUUID();
      const path = `${productId}/${id}`;
      // Files first: a row must never point at a file that doesn't exist.
      for (const [size, image] of [["large", large], ["small", small]] as const) {
        const { error } = await bucket().upload(fileFor(path, size), image.bytes, {
          contentType: "image/webp",
          cacheControl: ONE_YEAR_SECONDS,
          upsert: false,
        });
        if (error) {
          if (size === "small") await deleteFiles(path);
          throw new Error(`productImages.add: upload failed: ${error.message}`);
        }
      }

      const result = await client
        .from("product_images")
        .insert({ id, product_id: productId, path, alt, position, width: large.width, height: large.height })
        .select(IMAGE_COLUMNS)
        .single();
      if (result.error) {
        // Compensate: the row didn't make it, so the files must go too.
        await deleteFiles(path);
        const code = result.error.code;
        if (code === UNIQUE_VIOLATION || code === CHECK_VIOLATION) throw new ConflictError("Photo position taken or limit reached");
        throw toRepositoryError(result, "productImages.add");
      }
      return toImage(client, result.data);
    },

    async updateAlt(id, alt) {
      if (!isUuid(id)) return null;
      const result = await client.from("product_images").update({ alt }).eq("id", id).select(IMAGE_COLUMNS).maybeSingle();
      if (result.error) throw toRepositoryError(result, "productImages.updateAlt");
      return result.data ? toImage(client, result.data) : null;
    },

    async reorder(productId, orderedIds) {
      const result = await client.rpc("reorder_product_images", { product: productId, ordered: orderedIds });
      if (result.error) {
        // 22023: the id list no longer matches (a photo was added or removed meanwhile).
        if (result.error.code === "22023" || result.error.code === UNIQUE_VIOLATION) throw new ConflictError();
        throw toRepositoryError(result, "productImages.reorder");
      }
    },

    async remove(id) {
      if (!isUuid(id)) return false;
      // Row first: the shop stops showing the photo even if deleting the files then fails.
      const result = await client.from("product_images").delete().eq("id", id).select("path").maybeSingle();
      if (result.error) throw toRepositoryError(result, "productImages.remove");
      if (!result.data) return false;
      await deleteFiles(z.object({ path: z.string() }).parse(result.data).path);
      return true;
    },
  };
}
