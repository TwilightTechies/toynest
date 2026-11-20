"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";

// Store settings (ADR-022). A public POST endpoint: requireAdmin() first (layer 3); the write runs
// with the admin's own session, and RLS lets only admins update the row (layer 4).
const SettingsFormSchema = z.object({
  phoneOtpEnabled: z.enum(["on", "off"]),
  version: z.string().min(1).max(64),
});

export async function savePhoneOtp(formData: FormData): Promise<void> {
  const { context } = await requireAdmin();
  const parsed = SettingsFormSchema.safeParse({ phoneOtpEnabled: formData.get("phoneOtpEnabled"), version: formData.get("version") });
  if (!parsed.success) redirect("/admin/settings?saved=invalid");
  const saved = await context.settings.setPhoneOtp(parsed.data.phoneOtpEnabled === "on", parsed.data.version);
  redirect(`/admin/settings?saved=${saved ? "yes" : "conflict"}`);
}
