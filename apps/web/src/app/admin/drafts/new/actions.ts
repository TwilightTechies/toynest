"use server";

import { ProductBriefSchema, type DraftReviewOutcome, type ProductBrief, type ProductDraftOutcome } from "@toynest/ai";
import { createDraftServices } from "@/lib/ai";

export type DraftRunState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; brief: ProductBrief; draft: ProductDraftOutcome; review: DraftReviewOutcome | null };

export async function runDraft(_previous: DraftRunState, formData: FormData): Promise<DraftRunState> {
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
