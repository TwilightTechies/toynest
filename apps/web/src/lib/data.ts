import "server-only";
import path from "node:path";
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
  CategoryRepository,
  Customer,
  CustomerRepository,
  OrderRepository,
  ProductRepository,
} from "@toynest/core";
import { dataDir, loadRootEnv } from "./env";

export type DataSource = "supabase" | "sample";

export interface Repositories {
  source: DataSource;
  products: ProductRepository;
  categories: CategoryRepository;
  customers: CustomerRepository;
  orders: OrderRepository;
  // Demo-only list for the mock sign-in on /support.
  demoCustomers(): Promise<Customer[]>;
}

let serviceClient: SupabaseClient | undefined;

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

  const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
  const support = await loadSampleSupport(path.join(dataDir, "sample-support.json"));
  return {
    source: "sample",
    ...catalog,
    customers: support.customers,
    orders: support.orders,
    demoCustomers: async () => support.sampleCustomers,
  };
}
