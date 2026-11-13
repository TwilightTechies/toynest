"use server";

import type { ImageFailureReason } from "@toynest/core";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { CATALOG_CACHE_TAG } from "@/lib/catalog";

// Product photo actions (ADR-017). Each one is a public POST endpoint: requireAdmin() first, then the
// form fields are validated. Storage and table RLS check the admin again in the database.

export type UploadResult = { ok: true } | { ok: false; message: string };

const failureText: Record<ImageFailureReason, string> = {
  too_large: "is over 5 MB",
  unsupported_format: "isn't a JPEG, PNG or WebP photo",
  too_small: "is smaller than 400 px on its shortest side",
  too_many_pixels: "has more than 40 megapixels",
  unreadable: "couldn't be read (the file may be damaged)",
  limit_reached: "wasn't added: this product already has 8 photos",
  invalid_alt: "needs a description",
  not_found: "wasn't added: the product no longer exists",
  busy: "wasn't added: the photos changed at the same moment. Try again",
};

const IdsSchema = z.object({ productId: z.uuid(), imageId: z.uuid() });

async function uploadFrom(formData: FormData): Promise<{ productId: string | null; result: UploadResult }> {
  const { photos } = await requireAdmin();
  const productId = z.uuid().safeParse(formData.get("productId"));
  const file = formData.get("photo");
  if (!productId.success) return { productId: null, result: { ok: false, message: "That request wasn't valid. Reload the page." } };
  if (!(file instanceof File) || file.size === 0) return { productId: productId.data, result: { ok: false, message: "Choose a photo first." } };

  const name = file.name.slice(0, 80) || "This file";
  // file.type and file.name come from the browser and are ignored: the processor reads the contents.
  const outcome = await photos.upload(productId.data, new Uint8Array(await file.arrayBuffer()));
  if (!outcome.ok) return { productId: productId.data, result: { ok: false, message: `${name} ${failureText[outcome.reason]}.` } };
  updateTag(CATALOG_CACHE_TAG);
  return { productId: productId.data, result: { ok: true } };
}

// Called once per file by the uploader (JS), which shows progress and refreshes when done.
export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  return (await uploadFrom(formData)).result;
}

// The same upload as a plain form post (no JS): one file, then back to the page with a message.
export async function uploadPhotoForm(formData: FormData): Promise<void> {
  const { productId, result } = await uploadFrom(formData);
  if (!productId) redirect("/admin/products");
  redirect(`/admin/products/${productId}?${new URLSearchParams(result.ok ? { photo: "added" } : { photoError: result.message })}#photos`);
}

export async function savePhotoAlt(formData: FormData): Promise<void> {
  const { photos } = await requireAdmin();
  const ids = IdsSchema.safeParse({ productId: formData.get("productId"), imageId: formData.get("imageId") });
  if (!ids.success) redirect("/admin/products");
  const result = await photos.updateAlt(ids.data.imageId, String(formData.get("alt") ?? ""));
  if (result.ok) updateTag(CATALOG_CACHE_TAG);
  const query: Record<string, string> = result.ok ? { photo: "saved" } : { photoError: result.message ?? "The description couldn't be saved." };
  redirect(`/admin/products/${ids.data.productId}?${new URLSearchParams(query)}#photos`);
}

export async function movePhoto(formData: FormData): Promise<void> {
  const { photos } = await requireAdmin();
  const ids = IdsSchema.safeParse({ productId: formData.get("productId"), imageId: formData.get("imageId") });
  const direction = z.enum(["up", "down"]).safeParse(formData.get("direction"));
  if (!ids.success || !direction.success) redirect("/admin/products");
  const result = await photos.move(ids.data.productId, ids.data.imageId, direction.data);
  if (result.ok) updateTag(CATALOG_CACHE_TAG);
  const query: Record<string, string> = result.ok ? { photo: "moved" } : { photoError: "The photos changed meanwhile. Reload and try again." };
  redirect(`/admin/products/${ids.data.productId}?${new URLSearchParams(query)}#photos`);
}

export async function deletePhoto(formData: FormData): Promise<void> {
  const { photos } = await requireAdmin();
  const ids = IdsSchema.safeParse({ productId: formData.get("productId"), imageId: formData.get("imageId") });
  if (!ids.success) redirect("/admin/products");
  const result = await photos.remove(ids.data.productId, ids.data.imageId);
  if (result.ok) updateTag(CATALOG_CACHE_TAG);
  const query: Record<string, string> = result.ok ? { photo: "deleted" } : { photoError: "That photo was already removed." };
  redirect(`/admin/products/${ids.data.productId}?${new URLSearchParams(query)}#photos`);
}
