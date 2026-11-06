import { readFile } from "node:fs/promises";
import {
  CustomerSchema,
  OrderSchema,
  RepositoryUnavailableError,
  type Customer,
  type CustomerRepository,
  type Order,
  type OrderRepository,
} from "@toynest/core";
import { z } from "zod";

// Raw rows carry warehouse and carrier fields the domain does not need. Parsing with the domain
// schema drops them: the first trim happens here, at the adapter boundary.
const SampleSupportSchema = z.object({
  customers: z.array(CustomerSchema),
  orders: z.array(OrderSchema.extend({ simulateOutage: z.boolean().optional() })),
});

export interface SupportData {
  customers: CustomerRepository;
  orders: OrderRepository;
  // Synthetic sign-in list for the demo (stand-in for Supabase Auth).
  sampleCustomers: Customer[];
}

// Loads data/sample-support.json into in-memory repositories (stand-in for Supabase).
export async function loadSampleSupport(filePath: string): Promise<SupportData> {
  const data = SampleSupportSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  const outageIds = new Set(data.orders.filter((order) => order.simulateOutage).map((order) => order.id));
  const orders: Order[] = data.orders.map(({ simulateOutage: _ignored, ...order }) => order);

  return {
    customers: { findById: async (id) => data.customers.find((customer) => customer.id === id) ?? null },
    orders: createInMemoryOrderRepository(orders, outageIds),
    sampleCustomers: data.customers,
  };
}

export function createInMemoryOrderRepository(orders: Order[], outageIds = new Set<string>()): OrderRepository {
  return {
    findForCustomer: async (customerId, orderId) => {
      // Demo of a transient failure: "couldn't check" is not the same as "not found".
      if (outageIds.has(orderId)) throw new RepositoryUnavailableError("Order service timed out");
      return orders.find((order) => order.id === orderId && order.customerId === customerId) ?? null;
    },
    listForCustomer: async (customerId, limit) =>
      orders
        .filter((order) => order.customerId === customerId)
        .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
        .slice(0, limit),
  };
}
