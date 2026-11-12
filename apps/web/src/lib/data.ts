import "server-only";
import path from "node:path";
import { createInMemoryCartRepository, loadShippingZones } from "@toynest/adapters/sample-cart";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";
import { loadSampleSupport } from "@toynest/adapters/sample-support";
import {
  createSupabaseClient,
  createSupabaseRepositories,
  listDemoCustomers,
  readSupabaseEnv,
  type SupabaseClient,
} from "@toynest/adapters/supabase";
import type {
  CartRepository,
  CategoryRepository,
  Customer,
  CustomerRepository,
  OrderRepository,
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
    return { source: "supabase", ...createSupabaseRepositories(client), demoCustomers: () => listDemoCustomers(client) };
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
    demoCustomers: async () => support.sampleCustomers,
  };
}
