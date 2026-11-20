import { StoreSettingsSchema, type OutboxSms, type SmsOutbox, type StoreSettingsAdmin } from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";

// Shop-wide switches (ADR-022). The same code serves two clients:
// - the service role, for the server's reads (checkout, sign-in pages);
// - an admin's own session, for the settings page; RLS lets only admins read or update the row.
const SettingsRowSchema = z.object({ phone_otp_enabled: z.boolean(), updated_at: z.string() });

export function createSupabaseStoreSettingsAdmin(client: SupabaseClient): StoreSettingsAdmin {
  return {
    async get() {
      const result = await client.from("store_settings").select("phone_otp_enabled, updated_at").single();
      if (result.error) throw toRepositoryError(result, "settings.get");
      const row = SettingsRowSchema.parse(result.data);
      // The raw updated_at string is the version token (microseconds intact, ADR-016).
      return StoreSettingsSchema.parse({ phoneOtpEnabled: row.phone_otp_enabled, version: row.updated_at });
    },

    async setPhoneOtp(enabled, version) {
      // Matches the version too: zero rows = someone saved in between, or RLS refused (not an admin).
      const result = await client
        .from("store_settings")
        .update({ phone_otp_enabled: enabled })
        .eq("singleton", true)
        .eq("updated_at", version)
        .select("id");
      if (result.error) throw toRepositoryError(result, "settings.setPhoneOtp");
      return (result.data ?? []).length === 1;
    },
  };
}

const OutboxRowSchema = z.object({ phone: z.string(), otp: z.string(), created_at: z.string() });
const toSms = (row: unknown): OutboxSms => {
  const r = OutboxRowSchema.parse(row);
  return { phone: r.phone, otp: r.otp, createdAt: new Date(r.created_at).toISOString() };
};

// The mock SMS outbox. Service role (server log in mock mode, tests) or an admin's session.
export function createSupabaseSmsOutbox(client: SupabaseClient): SmsOutbox {
  return {
    async latestFor(e164) {
      const result = await client
        .from("sms_outbox")
        .select("phone, otp, created_at")
        .eq("phone", e164)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw toRepositoryError(result, "smsOutbox.latestFor");
      return result.data ? toSms(result.data) : null;
    },

    async recent(limit) {
      const result = await client
        .from("sms_outbox")
        .select("phone, otp, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (result.error) throw toRepositoryError(result, "smsOutbox.recent");
      return (result.data ?? []).map(toSms);
    },
  };
}
