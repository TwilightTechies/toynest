import { ConflictError } from "../errors";
import type { ImageProcessor, ImageRejection } from "../ports/image-processor";
import type { ProductAdminRepository } from "../ports/product-admin-repository";
import type { ProductImageAdminRepository } from "../ports/product-image-repository";
import { AltTextSchema, defaultAltText, MAX_IMAGES_PER_PRODUCT, MAX_UPLOAD_BYTES, type ProductImage } from "./product-image";

export type ImageFailureReason =
  | ImageRejection
  | "too_large"
  | "limit_reached"
  | "invalid_alt"
  | "not_found"
  // Another upload or reorder changed the photos at the same moment; trying again works.
  | "busy";

export type ImageResult<T> = { ok: true; value: T } | { ok: false; reason: ImageFailureReason; message?: string };

// Photo rules (ADR-017). Who may call it is decided outside: requireAdmin() in the web app, and the
// repository runs with the admin's session so Storage and table RLS check it again.
export function createProductImageService(
  images: ProductImageAdminRepository,
  products: ProductAdminRepository,
  processor: ImageProcessor,
) {
  // Keeps positions contiguous (0..n-1) after a delete, so "next position" is always the count.
  async function compact(productId: string): Promise<void> {
    const remaining = await images.list(productId);
    if (remaining.some((image, index) => image.position !== index)) {
      await images.reorder(productId, remaining.map((image) => image.id));
    }
  }

  return {
    async upload(productId: string, bytes: Uint8Array, alt?: string): Promise<ImageResult<ProductImage>> {
      // Cheapest checks first: size, then the product, then the cap, and only then decode the image.
      if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
      const product = await products.get(productId);
      if (!product) return { ok: false, reason: "not_found" };
      const existing = await images.list(productId);
      if (existing.length >= MAX_IMAGES_PER_PRODUCT) return { ok: false, reason: "limit_reached" };

      const altText = AltTextSchema.safeParse(alt?.trim() ? alt : defaultAltText(product.name, existing.length + 1));
      if (!altText.success) return { ok: false, reason: "invalid_alt", message: altText.error.issues[0]?.message };

      const processed = await processor.process(bytes);
      if (!processed.ok) return { ok: false, reason: processed.reason };

      try {
        const image = await images.add({
          productId,
          alt: altText.data,
          position: existing.length,
          large: processed.large,
          small: processed.small,
        });
        return { ok: true, value: image };
      } catch (error) {
        if (error instanceof ConflictError) return { ok: false, reason: "busy" };
        throw error;
      }
    },

    async updateAlt(id: string, alt: string): Promise<ImageResult<ProductImage>> {
      const parsed = AltTextSchema.safeParse(alt);
      if (!parsed.success) return { ok: false, reason: "invalid_alt", message: parsed.error.issues[0]?.message };
      const image = await images.updateAlt(id, parsed.data);
      return image ? { ok: true, value: image } : { ok: false, reason: "not_found" };
    },

    // Swaps a photo with its neighbour. Moving the first photo up (or the last down) is a no-op.
    async move(productId: string, imageId: string, direction: "up" | "down"): Promise<ImageResult<null>> {
      const ordered = await images.list(productId);
      const index = ordered.findIndex((image) => image.id === imageId);
      if (index === -1) return { ok: false, reason: "not_found" };
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= ordered.length) return { ok: true, value: null };
      const ids = ordered.map((image) => image.id);
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      try {
        await images.reorder(productId, ids);
      } catch (error) {
        if (error instanceof ConflictError) return { ok: false, reason: "busy" };
        throw error;
      }
      return { ok: true, value: null };
    },

    async remove(productId: string, imageId: string): Promise<ImageResult<null>> {
      const ordered = await images.list(productId);
      if (!ordered.some((image) => image.id === imageId)) return { ok: false, reason: "not_found" };
      await images.remove(imageId);
      await compact(productId);
      return { ok: true, value: null };
    },
  };
}

export type ProductImageService = ReturnType<typeof createProductImageService>;
