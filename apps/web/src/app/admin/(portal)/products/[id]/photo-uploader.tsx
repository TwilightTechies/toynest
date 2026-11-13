"use client";

import { MAX_UPLOAD_BYTES } from "@toynest/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, labelClass } from "@/components/ui";
import { uploadPhoto, uploadPhotoForm } from "./photo-actions";

interface Progress {
  done: number;
  total: number;
  errors: string[];
}

// Uploads the chosen files one per request (each stays under the 6 MB action limit) and reports
// progress. Without JS, the form posts natively to uploadPhotoForm, which takes the first file.
export function PhotoUploader({ productId, remaining }: { productId: string; remaining: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const busy = progress !== null && progress.done < progress.total;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("photo") as HTMLInputElement;
    const chosen = [...(input.files ?? [])];
    if (chosen.length === 0) {
      setProgress({ done: 0, total: 0, errors: ["Choose one or more photos first."] });
      return;
    }
    const files = chosen.slice(0, remaining);
    const errors =
      chosen.length > remaining ? [`Only ${remaining} more ${remaining === 1 ? "photo fits" : "photos fit"}; the rest were skipped.`] : [];
    setProgress({ done: 0, total: files.length, errors });

    for (const [index, file] of files.entries()) {
      // A quick check here saves sending a file the server would refuse anyway (it checks again).
      if (file.size > MAX_UPLOAD_BYTES) {
        errors.push(`${file.name} is over 5 MB.`);
      } else {
        const data = new FormData();
        data.set("productId", productId);
        data.set("photo", file);
        try {
          const result = await uploadPhoto(data);
          if (!result.ok) errors.push(result.message);
        } catch {
          errors.push(`${file.name} couldn't be uploaded. Check your connection and try again.`);
        }
      }
      setProgress({ done: index + 1, total: files.length, errors: [...errors] });
    }
    input.value = "";
    router.refresh();
  }

  return (
    <form action={uploadPhotoForm} onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
      <input type="hidden" name="productId" value={productId} />
      <label className={labelClass}>
        Add photos (JPEG, PNG or WebP, up to 5 MB each)
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="text-sm text-foreground file:mr-3 file:min-h-11 file:rounded-full file:border file:border-border-strong file:bg-surface-raised file:px-4 file:font-semibold"
        />
      </label>
      <button disabled={busy} className={`${buttonClass()} min-h-11 w-fit`}>
        {busy ? `Uploading ${progress.done + 1} of ${progress.total}…` : "Upload"}
      </button>
      <div aria-live="polite" className="text-sm">
        {progress && !busy && progress.total > 0 && (
          <p className="font-semibold">
            {progress.total - progress.errors.filter((e) => !e.startsWith("Only ")).length} of {progress.total} uploaded.
          </p>
        )}
        {progress && progress.errors.length > 0 && (
          <ul role="alert" className="mt-1 list-disc pl-5">
            {progress.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
