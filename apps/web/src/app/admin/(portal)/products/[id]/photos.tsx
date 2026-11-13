import { MAX_IMAGES_PER_PRODUCT, type ProductImage } from "@toynest/core";
import { Badge, buttonClass, cardClass, fieldClass } from "@/components/ui";
import { deletePhoto, movePhoto, savePhotoAlt } from "./photo-actions";
import { PhotoUploader } from "./photo-uploader";

const notices: Record<string, string> = {
  added: "Photo added.",
  saved: "Description saved.",
  moved: "Order changed.",
  deleted: "Photo deleted.",
};

// Photos card on the product edit page (ADR-017). Every control is a plain form posting a server
// action, so it all works without JavaScript; only the multi-file uploader is enhanced on the client.
export function PhotosCard({
  productId,
  photos,
  notice,
  error,
}: {
  productId: string;
  photos: ProductImage[];
  notice?: string;
  error?: string;
}) {
  const remaining = MAX_IMAGES_PER_PRODUCT - photos.length;
  const hidden = (imageId: string) => (
    <>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="imageId" value={imageId} />
    </>
  );

  return (
    <section id="photos" aria-labelledby="photos-heading" className={`${cardClass} flex scroll-mt-24 flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="photos-heading" className="font-display text-lg font-semibold">
          Photos
        </h2>
        <span className="text-sm text-muted">
          {photos.length} of {MAX_IMAGES_PER_PRODUCT}
        </span>
      </div>
      <p className="text-sm text-muted">The first photo is the main one: it appears on product cards and first on the product page.</p>

      {notice && notices[notice] && (
        <p role="status" className="rounded-xl bg-sage-soft px-4 py-3 text-sm font-semibold text-sage-strong">
          {notices[notice]}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <ol className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized at upload (ADR-017) */}
                <img src={photo.urls.small} alt="" loading="lazy" className="h-full w-full object-contain" />
                <span className="absolute left-2 top-2">
                  <Badge tone={index === 0 ? "sage" : "neutral"}>{index === 0 ? "Main photo" : `Photo ${index + 1}`}</Badge>
                </span>
              </div>

              <form action={savePhotoAlt} className="flex flex-col gap-2">
                {hidden(photo.id)}
                <label htmlFor={`alt-${photo.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Description (alt text)
                </label>
                <div className="flex gap-2">
                  <input id={`alt-${photo.id}`} name="alt" required maxLength={200} defaultValue={photo.alt} className={fieldClass} />
                  <button className={`${buttonClass("secondary", "sm")} min-h-11 shrink-0`}>Save</button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                {(["up", "down"] as const).map((direction) => {
                  const disabled = direction === "up" ? index === 0 : index === photos.length - 1;
                  return (
                    <form key={direction} action={movePhoto}>
                      {hidden(photo.id)}
                      <input type="hidden" name="direction" value={direction} />
                      <button
                        disabled={disabled}
                        aria-label={`Move photo ${index + 1} ${direction === "up" ? "earlier" : "later"}`}
                        className={`${buttonClass("secondary", "sm")} min-h-11 min-w-11`}
                      >
                        {direction === "up" ? "↑" : "↓"}
                      </button>
                    </form>
                  );
                })}
                <form action={deletePhoto} className="ml-auto">
                  {hidden(photo.id)}
                  <button aria-label={`Delete photo ${index + 1}`} className={`${buttonClass("ghost", "sm")} min-h-11`}>
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}

      {remaining > 0 ? (
        <PhotoUploader productId={productId} remaining={remaining} />
      ) : (
        <p className="text-sm text-muted">This product has the maximum of {MAX_IMAGES_PER_PRODUCT} photos. Delete one to add another.</p>
      )}
    </section>
  );
}
