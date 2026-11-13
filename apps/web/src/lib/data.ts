import "server-only";
import path from "node:path";
import { createMockPaymentProvider } from "@toynest/adapters/payments";
import { createInMemoryCartRepository, loadShippingZones } from "@toynest/adapters/sample-cart";
import { createInMemoryCheckoutRepository } from "@toynest/adapters/sample-checkout";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";
import { loadSampleSupport } from "@toynest/adapters/sample-support";
import {
  createSupabaseCheckoutRepository,
  createSupabaseClient,
  createSupabaseRepositories,
  listDemoCustomers,
  readSupabaseEnv,
  type SupabaseClient,
} from "@toynest/adapters/supabase";
import type {
  CartRepository,
  CategoryRepository,
  CheckoutOrderRepository,
  Customer,
  CustomerRepository,
  OrderRepository,
  PaymentProvider,
  ProductImageRepository,
  ProductRepository,
  ShippingZoneRepository,
} from "@toynest/core";
import { dataDir, loadRootEnv } from "./env";

export type DataSource = "supabase" | "sample";

export interface Repositories {
  source: DataSource;
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  orders: OrderRepository;
  carts: CartRepository;
  shippingZones: ShippingZoneRepository;
  images: ProductImageRepository;
  // Checkout (ADR-019): orders written by the server only, and the payment gateway (mock for now).
  checkoutOrders: CheckoutOrderRepository;
  payments: PaymentProvider;
  // Demo-only list for the mock sign-in on /support.
  demoCustomers(): Promise<Customer[]>;
}

let serviceClient: SupabaseClient | undefined;
// Sample mode is built once per server process: the loaders give products new random ids on every
// load, and a basket line must keep pointing at the same product between requests.
let sampleRepositories: Promise<Repositories> | undefined;

// Composition root: the only place that decides which adapters the app uses.
// Supabase when configured, otherwise the synthetic sample JSON, so the app runs with no setup.
export async function getRepositories(): Promise<Repositories> {
  loadRootEnv();
  const env = readSupabaseEnv();

  if (env) {
    // Service role on the server only (bypasses RLS); every order query is still scoped to the
    // session's customer id (isolation layer 3). Real user sessions replace this in the auth phase,
    // at which point RLS (layer 4) applies to the app's reads too.
    serviceClient ??= createSupabaseClient({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
    const client = serviceClient;
    const payments = createMockPaymentProvider();
    return {
      source: "supabase",
      ...createSupabaseRepositories(client),
      checkoutOrders: createSupabaseCheckoutRepository(client, payments.name),
      payments,
      demoCustomers: () => listDemoCustomers(client),
    };
  }

  sampleRepositories ??= loadSampleRepositories();
  return sampleRepositories;
}

async function loadSampleRepositories(): Promise<Repositories> {
  const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
  const support = await loadSampleSupport(path.join(dataDir, "sample-support.json"));
  return {
    source: "sample",
    ...catalog,
    customers: support.customers,
    orders: support.orders,
    carts: createInMemoryCartRepository(),
    shippingZones: await loadShippingZones(path.join(dataDir, "shipping-zones.json")),
    // Sample mode has no photos: every product shows its category placeholder (ADR-017).
    images: { listForProducts: async () => new Map() },
    checkoutOrders: createInMemoryCheckoutRepository(),
    payments: createMockPaymentProvider(),
    demoCustomers: async () => support.sampleCustomers,
  };
}
