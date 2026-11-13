import type { CatalogPhoto } from "@/lib/catalog";
import { GalleryThumbs } from "./gallery-thumbs";
import { ProductImage } from "./product-image";
import { photoSrcSet } from "./product-photo";

// PDP gallery (ADR-017). A CSS scroll-snap track: swiping works on phones without any JavaScript, and
// each slide has an id, so the thumbnails are plain #anchor links. GalleryThumbs only enhances them.
export function ProductGallery({ images, name, categorySlug }: { images: CatalogPhoto[]; name: string; categorySlug: string | undefined }) {
  if (images.length === 0) {
    return (
      <div className="self-start rounded-2xl border border-border bg-surface-raised p-3">
        <ProductImage categorySlug={categorySlug} size="hero" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 self-start">
      <div
        id="gallery-track"
        role="region"
        aria-label={`${name}: ${images.length} ${images.length === 1 ? "photo" : "photos"}`}
        // Focusable so keyboard users can scroll it with the arrow keys.
        tabIndex={0}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl border border-border bg-surface-raised [scrollbar-width:none] motion-reduce:scroll-auto"
      >
        {images.map((image, index) => (
          <figure key={image.large} id={`photo-${index + 1}`} className="aspect-[4/3] w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized at upload (ADR-017) */}
            <img
              src={image.large}
              srcSet={photoSrcSet(image)}
              // One column on phones, half the page from md up.
              sizes="(min-width: 768px) 560px, 100vw"
              width={image.width}
              height={image.height}
              alt={image.alt}
              // The first photo is the page's main image: load it straight away.
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </figure>
        ))}
      </div>
      {images.length > 1 && <GalleryThumbs images={images.map(({ small, alt }) => ({ small, alt }))} />}
    </div>
  );
}
