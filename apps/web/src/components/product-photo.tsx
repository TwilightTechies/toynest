import type { CatalogPhoto } from "@/lib/catalog";
import { ProductImage } from "./product-image";

// Responsive <img> over the two stored renditions (ADR-017). The files are resized once at upload, so
// next/image would only resize them again (and, on a host, count against its optimisation quota).
export function photoSrcSet(image: CatalogPhoto): string {
  return `${image.small} ${image.smallWidth}w, ${image.large} ${image.width}w`;
}

// Product cards: the main photo, or the category placeholder when there is none. Decorative here
// (alt=""), because the card's link right below already names the product.
export function ProductCardPhoto({ image, categorySlug }: { image?: CatalogPhoto; categorySlug: string | undefined }) {
  if (!image) return <ProductImage categorySlug={categorySlug} />;
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized at upload, see above */}
      <img
        src={image.small}
        srcSet={photoSrcSet(image)}
        // Two columns on phones, up to four on wide screens.
        sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 50vw"
        width={image.width}
        height={image.height}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
