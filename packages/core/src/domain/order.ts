import { z } from "zod";
import { SlugSchema } from "./product";

// awaiting_payment: an online-payment order that isn't paid yet (ADR-019).
export const OrderStatusSchema = z.enum(["awaiting_payment", "placed", "dispatched", "delivered", "cancelled"]);

// "TN-" plus 4 to 8 digits. Seeded orders are TN-10xx; checkout numbers start at TN-20001 (ADR-019).
export const ORDER_NUMBER_PATTERN = /^TN-\d{4,8}$/;

export const OrderItemSchema = z.object({
  productSlug: SlugSchema,
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
});

// Money in minor units (paise). refundedMinor is the total already refunded on this order.
export const OrderSchema = z.object({
  id: z.string().regex(ORDER_NUMBER_PATTERN, "Order ids look like TN-1042"),
  customerId: z.string().min(1),
  status: OrderStatusSchema,
  placedAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  totalMinor: z.number().int().nonnegative(),
  refundedMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  items: z.array(OrderItemSchema).min(1),
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
