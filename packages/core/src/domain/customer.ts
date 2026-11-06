import { z } from "zod";

export const CustomerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
});

export type Customer = z.infer<typeof CustomerSchema>;
