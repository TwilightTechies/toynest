import type { ProductImage } from "../domain/product-image";
import type { ProcessedImage } from "./image-processor";

// Storefront read port: photos for many products in one call (a page of cards, or one PDP).
// Product ids with no photos are simply absent from the map.
export interface ProductImageRepository {
  listForProducts(productIds: string[]): Promise<Map<string, ProductImage[]>>;
}

export interface NewProductImage {
  productId: string;
  alt: string;
  position: number;
  large: ProcessedImage;
  small: ProcessedImage;
}

// Admin write port (ADR-017). Runs with the admin's session, so Storage and table RLS both check it.
export interface ProductImageAdminRepository {
  // Ordered by position.
  list(productId: string): Promise<ProductImage[]>;
  // Stores both files, then the row; removes the files again if the row can't be written.
  // Throws ConflictError if the position is taken or the 8-photo cap is reached (database check).
  add(image: NewProductImage): Promise<ProductImage>;
  updateAlt(id: string, alt: string): Promise<ProductImage | null>;
  // `orderedIds` must be exactly the product's photo ids; positions become 0..n-1 in that order.
  reorder(productId: string, orderedIds: string[]): Promise<void>;
  // Deletes the row, then the files. false = no such photo.
  remove(id: string): Promise<boolean>;
}
