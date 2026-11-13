import { z } from "zod";
import { PincodeSchema } from "./cart";
import { OrderStatusSchema } from "./order";

// Checkout (ADR-019): guest orders, mock online payment or Cash on Delivery.

// Cash on Delivery is offered up to this total (₹10,000), a common limit for Indian shops: above it,
// the risk of a refused parcel outweighs the convenience. Online payment has no limit.
export const COD_MAX_MINOR = 10_000_00;

export const PaymentMethodSchema = z.enum(["online", "cod"]);
// cod_due: Cash on Delivery, collected by the courier.
export const PaymentStatusSchema = z.enum(["pending", "paid", "failed", "cod_due"]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// The 28 states and 8 union territories, as shoppers pick them.
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
] as const;

export const IndianStateSchema = z.enum(INDIAN_STATES, { error: "Choose a state or union territory" });

// "+91 98765 43210", "098765-43210" and "9876543210" are the same Indian mobile number.
export function normaliseIndianMobile(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export const CheckoutDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254)),
  phone: z
    .string()
    .transform(normaliseIndianMobile)
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")),
  line1: z.string().trim().min(3, "Enter the house number and street").max(120),
  line2: z.string().trim().max(120).optional().transform((value) => value || null),
  city: z.string().trim().min(2, "Enter the town or city").max(60),
  state: IndianStateSchema,
  pincode: PincodeSchema,
});

export type CheckoutDetails = z.infer<typeof CheckoutDetailsSchema>;

export interface CheckoutOrderLine {
  productId: string | null;
  productSlug: string;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
  personalisationName: string | null;
}

// What checkout stores. Prices are copied from the products at this moment (frozen), so later
// catalogue changes never rewrite a past order.
export interface OrderDraft {
  // Random per checkout page view: the same token always yields the same order (idempotency).
  checkoutToken: string;
  cartId: string;
  details: CheckoutDetails;
  paymentMethod: PaymentMethod;
  status: z.infer<typeof OrderStatusSchema>;
  paymentStatus: PaymentStatus;
  subtotalMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  currency: string;
  zoneName: string;
  lines: CheckoutOrderLine[];
}

export const CheckoutOrderSchema = z.object({
  // The order's random uuid: the confirmation page URL (a capability URL for guests).
  id: z.uuid(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  paymentMethod: PaymentMethodSchema,
  paymentStatus: PaymentStatusSchema,
  placedAt: z.iso.datetime(),
  cartId: z.uuid().nullable(),
  // As stored (already validated at checkout): an empty second address line is null.
  details: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
  }),
  subtotalMinor: z.number().int().nonnegative(),
  deliveryMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  zoneName: z.string(),
  lines: z.array(
    z.object({
      productSlug: z.string(),
      productName: z.string(),
      unitPriceMinor: z.number().int().nonnegative(),
      quantity: z.number().int().positive(),
      personalisationName: z.string().nullable(),
    }),
  ),
});

export type CheckoutOrder = z.infer<typeof CheckoutOrderSchema>;
