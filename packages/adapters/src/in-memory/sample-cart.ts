import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  MAX_LINE_QUANTITY,
  ShippingZoneSchema,
  type Cart,
  type CartRepository,
  type ShippingZone,
  type ShippingZoneRepository,
} from "@toynest/core";
import { z } from "zod";

// data/shipping-zones.json: the one source for delivery rates, shared with the Supabase seed.
export const ShippingZonesFileSchema = z.object({
  zones: z.array(ShippingZoneSchema.omit({ id: true })),
});

export async function loadShippingZones(filePath: string): Promise<ShippingZoneRepository> {
  const data = ShippingZonesFileSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  const zones: ShippingZone[] = data.zones.map((zone) => ({ id: randomUUID(), ...zone }));
  return { list: async () => zones };
}

// In-process baskets for the sample-data mode (no Supabase). Lost on restart, which is fine there.
// Same behaviour as the Supabase adapter; the shared contract suite checks both.
export function createInMemoryCartRepository(): CartRepository {
  const carts = new Map<string, Cart>();
  const copy = (cart: Cart): Cart => ({ ...cart, lines: cart.lines.map((line) => ({ ...line })) });

  return {
    async create() {
      const cart: Cart = { id: randomUUID(), pincode: null, lines: [] };
      carts.set(cart.id, cart);
      return copy(cart);
    },
    async get(cartId) {
      const cart = carts.get(cartId);
      return cart ? copy(cart) : null;
    },
    async addLine(cartId, { productId, personalisationName, quantity }) {
      const cart = carts.get(cartId);
      if (!cart) throw new Error(`Cart ${cartId} not found`);
      const existing = cart.lines.find(
        (line) => line.productId === productId && line.personalisationName === personalisationName,
      );
      const add = Math.min(Math.max(quantity, 1), MAX_LINE_QUANTITY);
      if (existing) existing.quantity = Math.min(existing.quantity + add, MAX_LINE_QUANTITY);
      else cart.lines.push({ id: randomUUID(), productId, personalisationName, quantity: add });
    },
    async setQuantity(cartId, lineId, quantity) {
      const line = carts.get(cartId)?.lines.find((l) => l.id === lineId);
      if (!line) return false;
      line.quantity = quantity;
      return true;
    },
    async removeLine(cartId, lineId) {
      const cart = carts.get(cartId);
      const index = cart?.lines.findIndex((l) => l.id === lineId) ?? -1;
      if (!cart || index < 0) return false;
      cart.lines.splice(index, 1);
      return true;
    },
    async setPincode(cartId, pincode) {
      const cart = carts.get(cartId);
      if (cart) cart.pincode = pincode;
    },
    async delete(cartId) {
      carts.delete(cartId);
    },
  };
}
