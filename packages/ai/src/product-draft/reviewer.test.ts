import { describe, expect, it } from "vitest";
import { scriptedProvider } from "../testing/scripted-provider";
import type { ModelResponse } from "../types";
import type { ProductBrief, ProductDraft } from "./contract";
import { createDraftReviewer, type DraftReview } from "./reviewer";

const brief: ProductBrief = { name: "Wooden Alphabet Puzzle", details: "Age group: 3-6. Material: wood." };

const draft: ProductDraft = {
  title: "Wooden Alphabet Puzzle",
  description:
    "A colourful wooden alphabet puzzle for ages 3-6. Certified safe to EN71, with 26 chunky letters to lift and match.",
  categorySlug: "educational-toys",
  attributes: [
    { name: "ageRange", value: "3-6 years" },
    { name: "material", value: "Wood" },
  ],
  tags: ["alphabet", "wooden puzzle", "early learning"],
  similarProducts: [],
  missingInformation: [{ field: "learningFocus", note: "Not stated in the brief" }],
};

const invented: DraftReview["findings"][number] = {
  category: "invented_fact",
  severity: "critical",
  quote: "Certified safe to EN71",
  explanation: "The brief gives no safety certification.",
  confidence: 0.95,
};

const submit = (id: string, review: DraftReview): ModelResponse => ({
  stopReason: "tool_use",
  content: [{ type: "tool_use", id, name: "submit_review", input: review }],
});
const done: ModelResponse = { stopReason: "end_turn", content: [{ type: "text", text: "Review submitted." }] };

describe("draft reviewer", () => {
  it("sees only the brief and the draft, in a fresh conversation with one tool", async () => {
    const { provider, requests } = scriptedProvider([submit("t1", { findings: [], summary: "No issues." }), done]);

    await createDraftReviewer({ provider }).review(brief, draft);

    const [first] = requests;
    expect(first?.messages).toHaveLength(1);
    expect(first?.messages[0]?.content).toContain("Certified safe to EN71");
    expect(first?.tools.map((tool) => tool.name)).toEqual(["submit_review"]);
    expect(first?.system).toContain("Do NOT flag style");
  });

  it("returns validated findings", async () => {
    const review = { findings: [invented], summary: "One invented safety claim." };
    const { provider } = scriptedProvider([submit("t1", review), done]);

    expect(await createDraftReviewer({ provider }).review(brief, draft)).toEqual({
      status: "reviewed",
      review,
      modelCalls: 2,
    });
  });

  it("rejects a quote that is not in the draft and accepts the corrected review", async () => {
    const madeUpQuote = { ...invented, quote: "Award-winning design" };
    const { provider, requests } = scriptedProvider([
      submit("t1", { findings: [madeUpQuote], summary: "One issue." }),
      submit("t2", { findings: [invented], summary: "One issue." }),
      done,
    ]);

    const outcome = await createDraftReviewer({ provider }).review(brief, draft);

    expect(requests[1]?.messages.at(-1)?.content).toEqual([
      expect.objectContaining({ is_error: true, content: expect.stringContaining('"Award-winning design"') }),
    ]);
    expect(outcome).toMatchObject({ status: "reviewed", review: { findings: [invented] } });
  });

  it("fails when the reviewer ends without submitting", async () => {
    const { provider } = scriptedProvider([done]);

    expect(await createDraftReviewer({ provider }).review(brief, draft)).toMatchObject({ status: "failed" });
  });
});
