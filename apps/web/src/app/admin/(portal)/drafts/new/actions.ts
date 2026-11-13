"use server";

import {
  ProductBriefSchema,
  ProductDraftSchema,
  type DraftReviewOutcome,
  type ProductBrief,
  type ProductDraftOutcome,
} from "@toynest/ai";
import { slugify } from "@toynest/core";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createDraftServices } from "@/lib/ai";

export type DraftRunState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; brief: ProductBrief; draft: ProductDraftOutcome; review: DraftReviewOutcome | null };

export async function runDraft(_previous: DraftRunState, formData: FormData): Promise<DraftRunState> {
  // Each run spends API credit: admins only.
  await requireAdmin();
  // Form input is an external boundary.
  const brief = ProductBriefSchema.safeParse({ name: formData.get("name"), details: formData.get("details") });
  if (!brief.success) return { status: "error", message: "Enter a product name and details (up to 2000 characters)." };

  const services = await createDraftServices();
  if (!services) {
    return {
      status: "error",
      message: "ANTHROPIC_API_KEY is not set. Add it to .env.local at the repo root and try again.",
    };
  }

  try {
    const draft = await services.writer.draft(brief.data);
    // The reviewer runs only on a finished draft, in its own conversation.
    const review = draft.status === "needs_review" ? await services.reviewer.review(brief.data, draft.draft) : null;
    return { status: "done", brief: brief.data, draft, review };
  } catch (error) {
    console.error("Draft run failed", error);
    return { status: "error", message: "The Claude API call failed. Check the server log for details." };
  }
}

export type SaveDraftState = { error: string | null };

// Hands an AI draft to the catalogue as a DRAFT product (ADR-016). The model never publishes: an
// admin sets the price, checks the details and presses Publish, which runs the publish rule.
export async function saveDraftAsProduct(_previous: SaveDraftState, formData: FormData): Promise<SaveDraftState> {
  const { context, catalogue } = await requireAdmin();
  // The draft came back from the browser in a hidden field: untrusted, so validate it again.
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("draft") ?? ""));
  } catch {
    return { error: "The draft couldn't be read. Run it again." };
  }
  const parsed = ProductDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "The draft couldn't be read. Run it again." };
  const draft = parsed.data;

  const category = (await context.categories.list()).find((c) => c.slug === draft.categorySlug);
  if (!category) return { error: `Unknown category "${draft.categorySlug}". Create the product by hand instead.` };

  const result = await catalogue.create({
    name: draft.title,
    slug: slugify(draft.title),
    description: draft.description,
    categoryId: category.id,
    // The writer never sets prices: ₹0 keeps it unpublishable until an admin enters one.
    priceMinor: 0,
    // Free-form names from the model stay as extra fields for the admin to check or clear.
    attributes: Object.fromEntries(draft.attributes.map((a) => [a.name.slice(0, 40), a.value.slice(0, 100)])),
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "slug_taken"
          ? "A product with this name already exists. Rename it in the catalogue instead."
          : "The draft doesn't fit the product form. Create the product by hand instead.",
    };
  }
  redirect(`/admin/products/${result.product.id}?saved=1`);
}
