// Starts the ToyNest MCP server over stdio. Configured for Claude Code in the repo's .mcp.json.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";
import { createToyNestServer } from "./server";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogPath = path.resolve(repoRoot, process.env.TOYNEST_CATALOG_PATH || "data/sample-catalog.json");

const server = createToyNestServer(await loadSampleCatalog(catalogPath));
await server.connect(new StdioServerTransport());

// stdout carries the MCP protocol, so logs must go to stderr.
console.error(`ToyNest MCP server ready (catalogue: ${path.relative(repoRoot, catalogPath)})`);
