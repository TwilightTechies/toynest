import { z } from "zod";
import { SlugSchema } from "./product";

export const OrderStatusSchema = z.enum(["placed", "dispatched", "delivered", "cancelled"]);

export const OrderItemSchema = z.object({
  productSlug: SlugSchema,
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
});

// Money in minor units (pence). refundedMinor is the total already refunded on this order.
export const OrderSchema = z.object({
  id: z.string().regex(/^TN-\d{4}$/, "Order ids look like TN-1042"),
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
