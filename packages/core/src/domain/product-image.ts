import { z } from "zod";

// Product photos (ADR-017). Files live in object storage; the database keeps these details only.

export const MAX_IMAGES_PER_PRODUCT = 8;
// Limit on what an admin may upload. Stored files are far smaller (resized WebP).
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// Shortest side, in pixels, after EXIF rotation. Smaller photos look blurry on the product page.
export const MIN_IMAGE_EDGE = 400;
// Longest side of the two stored renditions.
export const LARGE_IMAGE_EDGE = 1600;
export const SMALL_IMAGE_EDGE = 480;

export const AltTextSchema = z
  .string()
  .trim()
  .min(1, "Describe the photo (alt text)")
  .max(200, "Keep the description under 200 characters");

export const ProductImageSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  alt: z.string().min(1).max(200),
  // 0 = the main photo, used on product cards. Positions are kept contiguous (0..n-1).
  position: z.number().int().min(0).max(MAX_IMAGES_PER_PRODUCT - 1),
  // Size of the large rendition. The small one has the same aspect ratio.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  urls: z.object({ large: z.url(), small: z.url() }),
});

export type ProductImage = z.infer<typeof ProductImageSchema>;

export function defaultAltText(productName: string, photoNumber: number): string {
  return `${productName}, photo ${photoNumber}`.slice(0, 200);
}

// Width of the small rendition (for srcset), derived from the large one's size.
export function smallImageWidth(image: Pick<ProductImage, "width" | "height">): number {
  const longest = Math.max(image.width, image.height);
  return longest <= SMALL_IMAGE_EDGE ? image.width : Math.round((image.width * SMALL_IMAGE_EDGE) / longest);
}
