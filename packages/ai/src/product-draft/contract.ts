import { SlugSchema } from "@toynest/core";
import { z } from "zod";

// What the admin types in.
export const ProductBriefSchema = z.object({
  name: z.string().min(1).max(120),
  details: z.string().max(2000),
});

// What an assistant hands back for review. Both the single-agent and the
// coordinator implementations must produce exactly this shape.
export const ProductDraftSchema = z.object({
  title: z.string().min(5).max(80),
  description: z.string().min(50).max(1200),
  categorySlug: SlugSchema,
  attributes: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).max(12),
  tags: z.array(z.string().min(1)).min(3).max(10),
  // Provenance: each similar product must be a real catalogue slug found by a tool.
  similarProducts: z.array(z.object({ slug: SlugSchema, reason: z.string().min(1) })).max(5),
  // Facts the brief did not state. The assistant lists them here instead of inventing values.
  missingInformation: z.array(z.object({ field: z.string().min(1), note: z.string().min(1) })),
});

export type ProductBrief = z.infer<typeof ProductBriefSchema>;
export type ProductDraft = z.infer<typeof ProductDraftSchema>;

// "needs_review" rather than "done": AI output is a draft until an admin approves it.
export type ProductDraftOutcome =
  | { status: "needs_review"; draft: ProductDraft; modelCalls: number }
  | { status: "failed"; reason: string; modelCalls: number };

export interface ProductDraftAssistant {
  draft(brief: ProductBrief): Promise<ProductDraftOutcome>;
}
