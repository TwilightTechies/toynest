import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ProductBriefSchema, ProductDraftSchema } from "@toynest/ai";
import { z } from "zod";
import { dataDir } from "./env";

// Same contract the assistants must satisfy; the file is an external boundary, so validate it.
const SampleDraftSchema = z.object({
  brief: ProductBriefSchema,
  outcome: z.object({ status: z.literal("needs_review"), modelCalls: z.number().int(), draft: ProductDraftSchema }),
});

export type SampleDraft = z.infer<typeof SampleDraftSchema>;

export async function getSampleDraft(): Promise<SampleDraft> {
  "use cache";
  return SampleDraftSchema.parse(JSON.parse(await readFile(path.join(dataDir, "sample-draft.json"), "utf8")));
}
