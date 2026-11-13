"use server";

import { COD_MAX_MINOR, formatMoney, type CheckoutResult } from "@toynest/core";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearCartCookie, readCartId } from "@/lib/cart";
import { getCheckoutService } from "@/lib/checkout";

// Checkout actions (ADR-019). Public POST endpoints: every field is validated, and nothing
// price-related is read from the form. Totals come from the server's priceCart only.

export interface CheckoutFormState {
  message: string | null;
  fieldErrors: Record<string, string>;
  values?: Record<string, string>;
}

const DETAIL_FIELDS = ["name", "email", "phone", "line1", "line2", "city", "state", "pincode"] as const;

export async function placeOrder(_previous: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const values: Record<string, string> = {};
  for (const key of [...DETAIL_FIELDS, "paymentMethod"]) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }
  const token = z.uuid().safeParse(formData.get("checkoutToken"));
  if (!token.success) return { message: "This form has expired. Reload the page and try again.", fieldErrors: {}, values };

  const checkout = await getCheckoutService();
  const result = await checkout.placeOrder({
    cartId: await readCartId(),
    checkoutToken: token.data,
    details: Object.fromEntries(DETAIL_FIELDS.map((key) => [key, values[key] ?? ""])),
    paymentMethod: values.paymentMethod,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
        return { message: "Please check the highlighted fields.", fieldErrors: result.fieldErrors, values };
      case "empty_basket":
        redirect("/basket");
      case "unavailable_items":
        return {
          message: "Something in your basket is no longer available. Remove it from your basket, then check out again.",
          fieldErrors: {},
          values,
        };
      case "no_delivery":
        return { message: null, fieldErrors: { pincode: "We don't deliver to this pincode yet" }, values };
      case "cod_not_available":
        return {
          message: null,
          fieldErrors: { paymentMethod: `Cash on delivery is available for orders up to ${formatMoney(COD_MAX_MINOR)}` },
          values,
        };
      default:
        return { message: "Your order couldn't be placed. Please try again.", fieldErrors: {}, values };
    }
  }

  if (result.order.paymentMethod === "cod") {
    await clearCartCookie();
    redirect(`/checkout/confirmation/${result.order.id}`);
  }
  redirect(`/checkout/pay/${result.order.id}`);
}

const OrderIdSchema = z.uuid();

// Where to go after a payment step: a settled order goes to its confirmation (and the basket
// cookie is cleared); anything else back to the payment page.
async function afterPayment(orderId: string, result: CheckoutResult): Promise<never> {
  if (!result.ok) {
    if (result.reason === "not_found") redirect("/basket");
    redirect(`/checkout/pay/${orderId}`);
  }
  if (result.order.paymentStatus === "paid" || result.order.paymentStatus === "cod_due") {
    await clearCartCookie();
    redirect(`/checkout/confirmation/${orderId}`);
  }
  redirect(`/checkout/pay/${orderId}`);
}

export async function payOrder(formData: FormData): Promise<void> {
  const orderId = OrderIdSchema.safeParse(formData.get("orderId"));
  const outcome = z.enum(["success", "failure", "pending"]).safeParse(formData.get("outcome"));
  if (!orderId.success || !outcome.success) redirect("/basket");
  const checkout = await getCheckoutService();
  const result = await checkout.pay(orderId.data, outcome.data);
  await afterPayment(orderId.data, result);
}

export async function checkPaymentStatus(formData: FormData): Promise<void> {
  const orderId = OrderIdSchema.safeParse(formData.get("orderId"));
  if (!orderId.success) redirect("/basket");
  const checkout = await getCheckoutService();
  await afterPayment(orderId.data, await checkout.refreshPayment(orderId.data));
}

export async function payOnDelivery(formData: FormData): Promise<void> {
  const orderId = OrderIdSchema.safeParse(formData.get("orderId"));
  if (!orderId.success) redirect("/basket");
  const checkout = await getCheckoutService();
  await afterPayment(orderId.data, await checkout.switchToCod(orderId.data));
}
