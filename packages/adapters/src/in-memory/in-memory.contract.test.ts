import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeRepositoryContract, support } from "../contract/repository-contract";
import { createInMemoryCartRepository, loadShippingZones } from "./sample-cart";
import { loadSampleCatalog } from "./sample-catalog";
import { loadSampleSupport } from "./sample-support";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../data");

describeRepositoryContract("in-memory sample data", async () => {
  const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
  const { customers, orders } = await loadSampleSupport(path.join(dataDir, "sample-support.json"));
  return {
    ...catalog,
    customers,
    orders,
    carts: createInMemoryCartRepository(),
    shippingZones: await loadShippingZones(path.join(dataDir, "shipping-zones.json")),
    customerIdFor: async (email) => support.customers.find((c) => c.email === email)!.id,
  };
});
