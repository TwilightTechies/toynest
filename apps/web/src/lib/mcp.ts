import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { repoRoot } from "./env";

// Starts the ToyNest MCP server as a separate process and talks to it over stdio, exactly as
// Claude Code does via .mcp.json. The web app never imports the server's code.
export async function withToyNestMcp<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "apps/mcp-server/src/index.ts"],
    cwd: repoRoot,
    stderr: "ignore",
  });
  const client = new Client({ name: "toynest-admin", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}
