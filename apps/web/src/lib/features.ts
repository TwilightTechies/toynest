// Features that only work on a developer's machine (ADR-020).
// The MCP explorer starts apps/mcp-server as a child process over stdio, which a Vercel function
// can't do. Vercel sets VERCEL=1 at build and run time; locally (dev or `next start`) it stays on.
export const mcpExplorerEnabled = process.env.VERCEL !== "1";
