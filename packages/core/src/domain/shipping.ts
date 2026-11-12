import { z } from "zod";
import { SlugSchema } from "./product";

// Delivery charges are data in the shipping_zones table, so they change without a deploy.
export const ShippingZoneSchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1),
  feeMinor: z.number().int().nonnegative(),
  // Subtotal (paise) at or above which delivery is free; null = never free.
  freeOverMinor: z.number().int().nonnegative().nullable(),
  // Pincode prefixes of 1-6 digits, e.g. "560" (Bengaluru) or "78" (Assam).
  pincodePrefixes: z.array(z.string().regex(/^\d{1,6}$/)),
  isDefault: z.boolean(),
});

export type ShippingZone = z.infer<typeof ShippingZoneSchema>;

// The most specific (longest) matching prefix wins, so "744" (Andaman) can sit inside a broader
// zone. No match falls back to the default zone; null only if no default is configured.
export function resolveShippingZone(pincode: string, zones: ShippingZone[]): ShippingZone | null {
  let best: { zone: ShippingZone; length: number } | null = null;
  for (const zone of zones) {
    for (const prefix of zone.pincodePrefixes) {
      if (pincode.startsWith(prefix) && (!best || prefix.length > best.length)) best = { zone, length: prefix.length };
    }
  }
  return best?.zone ?? zones.find((zone) => zone.isDefault) ?? null;
}
