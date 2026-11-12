"use server";

import {
  MAX_LINE_QUANTITY,
  PincodeSchema,
  SlugSchema,
  validatePersonalisation,
} from "@toynest/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cartForWrite } from "@/lib/cart";
import { getRepositories } from "@/lib/data";

// Every form field is an external boundary: validated here, before anything reaches a repository.
// Prices are never accepted from the form; the basket is priced from product rows when shown.

const QuantityField = z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY);

export interface AddToBasketState {
  error: string | null;
  // Which field the error belongs to, so the form can mark it.
  field: "name" | "quantity" | null;
}

export async function addToBasket(_previous: AddToBasketState, formData: FormData): Promise<AddToBasketState> {
  const slug = SlugSchema.safeParse(formData.get("slug"));
  const quantity = QuantityField.safeParse(formData.get("quantity"));
  if (!slug.success) return { error: "That product can't be added.", field: null };
  if (!quantity.success) return { error: `Choose a quantity from 1 to ${MAX_LINE_QUANTITY}.`, field: "quantity" };

  const { products } = await getRepositories();
  const product = await products.findBySlug(slug.data);
  // Same rule as the product page: drafts and archived products are not for sale.
  if (!product || product.status !== "active") return { error: "This product is no longer available.", field: null };

  const name = formData.get("personalisationName");
  const personalisation = validatePersonalisation(product, typeof name === "string" ? name : null);
  if (!personalisation.ok) return { error: personalisation.error, field: "name" };

  const { cart, carts } = await cartForWrite();
  await carts.addLine(cart.id, {
    productId: product.id,
    personalisationName: personalisation.name,
    quantity: quantity.data,
  });
  revalidatePath("/", "layout"); // header count
  redirect("/basket");
}

const LineForm = z.object({ lineId: z.uuid() });

export async function updateQuantity(formData: FormData): Promise<void> {
  const line = LineForm.safeParse({ lineId: formData.get("lineId") });
  const quantity = QuantityField.safeParse(formData.get("quantity"));
  if (!line.success || !quantity.success) return;
  const { cart, carts } = await cartForWrite();
  // Scoped by this shopper's cart id: a line id from another basket is simply not found.
  await carts.setQuantity(cart.id, line.data.lineId, quantity.data);
  revalidatePath("/", "layout");
}

export async function removeLine(formData: FormData): Promise<void> {
  const line = LineForm.safeParse({ lineId: formData.get("lineId") });
  if (!line.success) return;
  const { cart, carts } = await cartForWrite();
  await carts.removeLine(cart.id, line.data.lineId);
  revalidatePath("/", "layout");
}

export interface PincodeState {
  error: string | null;
}

export async function setPincode(_previous: PincodeState, formData: FormData): Promise<PincodeState> {
  const raw = formData.get("pincode");
  const pincode = PincodeSchema.safeParse(typeof raw === "string" ? raw.replace(/\s/g, "") : raw);
  if (!pincode.success) return { error: "Enter a valid 6-digit pincode, e.g. 560001." };
  const { cart, carts } = await cartForWrite();
  await carts.setPincode(cart.id, pincode.data);
  revalidatePath("/basket");
  return { error: null };
}
