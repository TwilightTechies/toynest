"use server";

import { parseRupees, slugify, type AdminFailure, type ProductInput } from "@toynest/core";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { CATALOG_CACHE_TAG } from "@/lib/catalog";
import { ATTRIBUTE_FIELD_PREFIX } from "./form-fields";

// Server actions are public POST endpoints: each one checks the admin itself (requireAdmin) and
// treats every form field as untrusted input. Prices are converted to paise here, on the server.

export interface ProductFormState {
  message: string | null;
  problems: string[];
  // Echoed back so a rejected form keeps what the admin typed (React resets forms after an action).
  values?: Record<string, string>;
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

function attributesFrom(values: Record<string, string>): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(ATTRIBUTE_FIELD_PREFIX) && value.trim()) attributes[key.slice(ATTRIBUTE_FIELD_PREFIX.length)] = value.trim();
  }
  // Personalisation is a choice, not free text: only "name" exists today (ADR-015).
  if (values.personalisation === "name") attributes.personalisation = "name";
  return attributes;
}

function failureState(failure: AdminFailure, values?: Record<string, string>): ProductFormState {
  switch (failure.reason) {
    case "invalid":
      return { message: "Please fix the following:", problems: failure.problems, values };
    case "slug_taken":
      return { message: "Another product already uses that web address (slug). Change the slug.", problems: [], values };
    case "conflict":
      return {
        message: "Someone saved this product after you opened it, so your changes weren't saved. Reload the page to see the latest version.",
        problems: [],
        values,
      };
    case "not_found":
      return { message: "This product no longer exists.", problems: [] };
  }
}

export async function saveProduct(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { catalogue } = await requireAdmin();
  const values = formValues(formData);

  const priceMinor = parseRupees(values.price ?? "");
  if (priceMinor === null) {
    return { message: "Enter the price in rupees, for example 599 or 599.50.", problems: [], values };
  }
  const name = (values.name ?? "").trim();
  const input: ProductInput = {
    name,
    slug: (values.slug ?? "").trim() || slugify(name),
    description: values.description ?? "",
    categoryId: values.categoryId ?? "",
    priceMinor,
    attributes: attributesFrom(values),
  };

  const result = values.id
    ? await catalogue.update(values.id, input, values.version ?? "")
    : await catalogue.create(input);
  if (!result.ok) return failureState(result, values);

  updateTag(CATALOG_CACHE_TAG);
  redirect(`/admin/products/${result.product.id}?saved=1`);
}

const StatusFormSchema = z.object({
  id: z.uuid(),
  version: z.string().min(1),
  action: z.enum(["publish", "unpublish", "archive", "restore"]),
});

export async function changeStatus(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { catalogue } = await requireAdmin();
  const parsed = StatusFormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: "That request wasn't valid. Reload the page and try again.", problems: [] };

  const result = await catalogue.changeStatus(parsed.data.id, parsed.data.action, parsed.data.version);
  if (!result.ok) return failureState(result);

  updateTag(CATALOG_CACHE_TAG);
  redirect(`/admin/products/${result.product.id}?status=${result.product.status}`);
}
