import "server-only";
import { createCheckoutService, type CheckoutService } from "@toynest/core";
import { getRepositories } from "./data";

// Checkout (ADR-019). The service gets the shop's repositories: the service-role client for orders
// and baskets (server-only data), and the shop's category list (shown categories only).
export async function getCheckoutService(): Promise<CheckoutService> {
  const { carts, products, categories, shippingZones, checkoutOrders, payments } = await getRepositories();
  return createCheckoutService({ carts, products, categories, zones: shippingZones, orders: checkoutOrders, payments });
}

export async function getCheckoutOrder(orderId: string) {
  const { checkoutOrders } = await getRepositories();
  return checkoutOrders.get(orderId);
}

export const paymentStatusText = {
  pending: "Waiting for payment",
  paid: "Paid",
  failed: "Payment failed",
  cod_due: "Cash on delivery",
} as const;

// True while the bank hasn't confirmed an attempt: the payment page then offers "Check status"
// instead of another Pay button.
export async function hasPaymentInProgress(orderId: string): Promise<boolean> {
  const { checkoutOrders } = await getRepositories();
  return (await checkoutOrders.pendingAttempt(orderId)) !== null;
}
