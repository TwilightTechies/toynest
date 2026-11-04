import { z } from "zod";
import { runAgentLoop } from "../agent-loop";
import { defineTool } from "../tool";
import type { AIProvider } from "../types";
import type { ProductBrief, ProductDraft } from "./contract";

export const ReviewFindingSchema = z.object({
  category: z.enum(["invented_fact", "age_mismatch", "price_in_text"]),
  severity: z.enum(["critical", "major", "minor"]),
  // Exact words from the draft, so an admin can see what was flagged and code can check it exists.
  quote: z.string().min(1).max(300),
  explanation: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const DraftReviewSchema = z.object({
  findings: z.array(ReviewFindingSchema).max(10),
  summary: z.string().min(1).max(400),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type DraftReview = z.infer<typeof DraftReviewSchema>;

export type DraftReviewOutcome =
  | { status: "reviewed"; review: DraftReview; modelCalls: number }
  | { status: "failed"; reason: string; modelCalls: number };

// Explicit criteria (what to flag and what to ignore), severity defined by example, and few-shot
// cases that include one thing NOT to flag.
const SYSTEM_PROMPT = `You review AI-written ToyNest product drafts against the admin's brief before a human approves them.

Flag ONLY these three things:
1. invented_fact: the draft states a fact the brief does not contain (safety certifications, piece counts, dimensions, learning outcomes, materials, origin).
2. age_mismatch: the draft's age range or age wording differs from the brief.
3. price_in_text: a price appears in the title, description or tags.

Do NOT flag style, tone, word choice, length, or warm marketing language that makes no factual claim.
Facts listed under missingInformation are already flagged for the admin; do not flag them again.

Severity:
- critical: a safety or legal claim not in the brief, e.g. "Meets EN71 toy safety standards".
- major: any other factual claim not in the brief, or an age mismatch, e.g. "Contains 26 pieces" or "Perfect for toddlers" when the brief says 3-6.
- minor: wording that could mislead without stating a false fact, or a price in the text.

For each finding, quote the exact words from the draft, explain which rule they break, and give your confidence from 0 to 1.

Examples:
- Brief "Age 3-6. Wood." Draft "A sturdy wooden puzzle for ages 3-6." -> no findings.
- Brief "Age 3-6. Wood." Draft "Certified safe to EN71, ideal for ages 3-6." -> invented_fact, critical, quote "Certified safe to EN71".
- Brief "Age 3-6. Wood." Draft "A delightful, colourful puzzle little ones will love." -> no findings: warm language, no factual claim.

Call submit_review exactly once. If it returns an error, correct the review as the error explains and call it again.`;

export interface DraftReviewerDeps {
  provider: AIProvider;
  maxIterations?: number;
}

// An independent reviewer: a fresh conversation that sees only the brief and the finished draft,
// never the writer's reasoning, so it judges what is actually on the page.
export function createDraftReviewer({ provider, maxIterations = 4 }: DraftReviewerDeps) {
  return {
    async review(brief: ProductBrief, draft: ProductDraft): Promise<DraftReviewOutcome> {
      let accepted: DraftReview | undefined;
      const draftText = [draft.title, draft.description, ...draft.tags, ...draft.attributes.map((a) => a.value)]
        .join("\n")
        .toLowerCase();

      const submitReview = defineTool({
        name: "submit_review",
        description:
          "Submit your review of the draft. findings may be empty when nothing breaks the three rules. " +
          "Each quote must be copied exactly from the draft.",
        input: DraftReviewSchema,
        // The schema guarantees the shape; this checks meaning: every quote must really be in the draft.
        execute: async (review) => {
          const missing = review.findings.filter((finding) => !draftText.includes(finding.quote.toLowerCase()));
          if (missing.length > 0) {
            throw new Error(
              `These quotes do not appear in the draft: ${missing.map((finding) => `"${finding.quote}"`).join(", ")}. ` +
                "Copy the exact words from the draft, or remove the finding.",
            );
          }
          accepted = review;
          return { accepted: true };
        },
      });

      const result = await runAgentLoop({
        provider,
        system: SYSTEM_PROMPT,
        prompt: `Brief\nName: ${brief.name}\nDetails: ${brief.details}\n\nDraft\n${JSON.stringify(draft, null, 2)}`,
        tools: [submitReview],
        maxTokens: 16000,
        maxIterations,
      });

      if (accepted) return { status: "reviewed", review: accepted, modelCalls: result.iterations };
      const reason =
        result.status === "completed"
          ? "The reviewer finished without submitting a valid review."
          : `The reviewer stopped early: ${result.reason}.`;
      return { status: "failed", reason, modelCalls: result.iterations };
    },
  };
}
