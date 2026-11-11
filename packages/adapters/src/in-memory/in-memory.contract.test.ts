import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeRepositoryContract, support } from "../contract/repository-contract";
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
    customerIdFor: async (email) => support.customers.find((c) => c.email === email)!.id,
  };
});
