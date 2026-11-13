"use server";

import { parseRequiredAttributes, slugify, type CategoryFailure } from "@toynest/core";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { CATALOG_CACHE_TAG } from "@/lib/catalog";

// Category actions (ADR-018). Public POST endpoints: requireAdmin() first, every field validated.
// Each successful write refreshes the cached catalogue, including the header menu.

export interface CategoryFormState {
  message: string | null;
  problems: string[];
  values?: Record<string, string>;
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

function failureState(failure: CategoryFailure, values?: Record<string, string>): CategoryFormState {
  switch (failure.reason) {
    case "invalid":
      return { message: "Please fix the following:", problems: failure.problems, values };
    case "slug_taken":
      return { message: "Another category already uses that web address. Change the name or the web address.", problems: [], values };
    case "conflict":
      return { message: "Someone changed this category after you opened it, so your changes weren't saved. Reload the page.", problems: [], values };
    case "not_found":
      return { message: "This category no longer exists.", problems: [] };
    case "in_use":
      return { message: `${failure.productCount} products use this category. Hide it instead.`, problems: [] };
  }
}

export async function saveCategory(_previous: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const { categoryAdmin } = await requireAdmin();
  const values = formValues(formData);
  const name = (values.name ?? "").trim();
  const fields = {
    name,
    menuLabel: values.menuLabel ?? null,
    requiredAttributes: parseRequiredAttributes(values.requiredAttributes ?? ""),
  };

  const result = values.id
    ? await categoryAdmin.update(values.id, fields, values.version ?? "")
    : await categoryAdmin.create({ ...fields, slug: (values.slug ?? "").trim() || slugify(name) });
  if (!result.ok) return failureState(result, values);

  updateTag(CATALOG_CACHE_TAG);
  redirect(`/admin/categories/${result.value.id}?saved=1`);
}

const VisibleSchema = z.object({ id: z.uuid(), version: z.string().min(1), visible: z.enum(["true", "false"]) });

export async function setCategoryVisible(_previous: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const { categoryAdmin } = await requireAdmin();
  const parsed = VisibleSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: "That request wasn't valid. Reload the page.", problems: [] };
  const result = await categoryAdmin.setVisible(parsed.data.id, parsed.data.visible === "true", parsed.data.version);
  if (!result.ok) return failureState(result);
  updateTag(CATALOG_CACHE_TAG);
  redirect(`/admin/categories/${parsed.data.id}?shown=${parsed.data.visible}`);
}

export async function deleteCategory(_previous: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const { categoryAdmin } = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: "That request wasn't valid. Reload the page.", problems: [] };
  const result = await categoryAdmin.remove(id.data);
  if (!result.ok) return failureState(result);
  updateTag(CATALOG_CACHE_TAG);
  redirect("/admin/categories?deleted=1");
}

const MoveSchema = z.object({ id: z.uuid(), direction: z.enum(["up", "down"]) });

// A plain form on the list page; no state to show beyond the new order.
export async function moveCategory(formData: FormData): Promise<void> {
  const { categoryAdmin } = await requireAdmin();
  const parsed = MoveSchema.safeParse(formValues(formData));
  if (parsed.success) {
    const result = await categoryAdmin.move(parsed.data.id, parsed.data.direction);
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
  }
  redirect("/admin/categories");
}
