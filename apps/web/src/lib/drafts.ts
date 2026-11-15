import "server-only";
import { ProductBriefSchema, ProductDraftSchema } from "@toynest/ai";
import { z } from "zod";
// Imported, not read from disk at request time: the file is bundled into the build, so the page also
// works on Vercel, where the repo's data/ folder isn't next to the running function (ADR-020).
import sampleDraft from "../../../../data/sample-draft.json";

// Same contract the assistants must satisfy; the file is an external boundary, so validate it.
const SampleDraftSchema = z.object({
  brief: ProductBriefSchema,
  outcome: z.object({ status: z.literal("needs_review"), modelCalls: z.number().int(), draft: ProductDraftSchema }),
});

export type SampleDraft = z.infer<typeof SampleDraftSchema>;

export async function getSampleDraft(): Promise<SampleDraft> {
  return SampleDraftSchema.parse(sampleDraft);
}
