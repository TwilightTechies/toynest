import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";
import type { ProductRepository } from "@toynest/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createToyNestServer, type ServerDeps } from "./server";

const catalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/sample-catalog.json");

// A real MCP client talking to the server in memory: the same protocol Claude Code uses, no process or network.
async function connect(deps: ServerDeps) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createToyNestServer(deps).connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

// Tool results are JSON in a single text block.
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [block] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, body: JSON.parse(block?.text ?? "null") as unknown };
}

let deps: ServerDeps;
beforeEach(async () => {
  deps = await loadSampleCatalog(catalogPath);
});

describe("ToyNest MCP server", () => {
  it("lists its tools with descriptions and exposes the categories resource", async () => {
    const client = await connect(deps);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_categories", "get_product", "search_products"]);
    expect(tools.every((tool) => (tool.description ?? "").length > 80)).toBe(true);

    const { contents } = await client.readResource({ uri: "toynest://categories" });
    const [resource] = contents;
    const categories = JSON.parse(resource && "text" in resource ? resource.text : "[]") as { slug: string }[];
    expect(categories.map((category) => category.slug)).toContain("educational-toys");
  });

  it("finds products by keyword and category", async () => {
    const client = await connect(deps);

    const { isError, body } = await call(client, "search_products", { query: "puzzle", categorySlug: "educational-toys" });

    expect(isError).toBe(false);
    expect(body).toMatchObject({
      items: [expect.objectContaining({ slug: "wooden-number-puzzle", categorySlug: "educational-toys", priceMinor: 1299 })],
    });
  });

  it("treats no matches as a successful empty result, not an error", async () => {
    const client = await connect(deps);

    expect(await call(client, "search_products", { query: "unicorn kite" })).toEqual({
      isError: false,
      body: { total: 0, items: [] },
    });
    expect(await call(client, "get_product", { slug: "unicorn-kite" })).toEqual({
      isError: false,
      body: { found: false, slug: "unicorn-kite" },
    });
  });

  it("reports an unknown category as a non-retryable validation error listing valid slugs", async () => {
    const client = await connect(deps);

    const { isError, body } = await call(client, "search_products", { categorySlug: "toys" });

    expect(isError).toBe(true);
    expect(body).toMatchObject({ errorCategory: "validation", isRetryable: false });
    expect((body as { message: string }).message).toContain("educational-toys");
  });

  it("reports a failing repository as a retryable transient error instead of an empty list", async () => {
    const timingOut: ProductRepository = {
      findBySlug: () => Promise.reject(new Error("timeout")),
      search: () => Promise.reject(new Error("timeout")),
    };
    const client = await connect({ ...deps, products: timingOut });

    const { isError, body } = await call(client, "search_products", { query: "puzzle" });

    expect(isError).toBe(true);
    expect(body).toMatchObject({ errorCategory: "transient", isRetryable: true });
  });
});
