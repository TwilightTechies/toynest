import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { withToyNestMcp } from "@/lib/mcp";

export const metadata: Metadata = { title: "MCP explorer · ToyNest admin" };

// One example per behaviour from Day 3: a match, empty-is-not-an-error, and a structured validation error.
const examples = [
  { label: "Search 'puzzle'", tool: "search_products", args: { query: "puzzle" } },
  { label: "Empty search", tool: "search_products", args: { query: "unicorn kite" } },
  { label: "Unknown category", tool: "search_products", args: { categorySlug: "toys" } },
  { label: "Product by slug", tool: "get_product", args: { slug: "wind-up-robot" } },
  { label: "Missing product", tool: "get_product", args: { slug: "unicorn-kite" } },
  { label: "Categories", tool: "get_categories", args: {} },
];

const hrefFor = (tool: string, args: object) =>
  `/admin/mcp?${new URLSearchParams({ tool, args: JSON.stringify(args) })}`;

// Query string is external input: validate it before passing it on.
const QuerySchema = z.object({
  tool: z.string().optional(),
  args: z.string().optional(),
});
const ArgsSchema = z.record(z.string(), z.unknown());

export default function McpExplorerPage({ searchParams }: PageProps<"/admin/mcp">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Read-only tools
      </p>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">MCP explorer</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Each request starts <code className="font-mono">apps/mcp-server</code> and calls it over stdio, the same way
        Claude Code does.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-zinc-500">Starting the MCP server…</p>}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Explorer({ searchParams }: Pick<PageProps<"/admin/mcp">, "searchParams">) {
  // Checked here too: the page renders in parallel with the layout's check (lib/admin.ts).
  await requireAdmin();
  const query = QuerySchema.safeParse(await searchParams);
  const selected = query.success ? query.data : {};
  let parsedArgs: Record<string, unknown> | undefined;
  let argsError: string | undefined;
  if (selected.tool) {
    try {
      parsedArgs = ArgsSchema.parse(JSON.parse(selected.args || "{}"));
    } catch {
      argsError = "Arguments must be a JSON object, e.g. {\"query\": \"puzzle\"}.";
    }
  }

  const { tools, result } = await withToyNestMcp(async (client) => ({
    tools: (await client.listTools()).tools,
    result: selected.tool && parsedArgs ? await client.callTool({ name: selected.tool, arguments: parsedArgs }) : null,
  }));
  const [block] = (result?.content ?? []) as { type: string; text?: string }[];

  return (
    <>
      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-500">Try an example</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {examples.map((example) => (
            <li key={example.label}>
              <Link
                href={hrefFor(example.tool, example.args)}
                className="block rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:border-zinc-500 dark:border-zinc-700"
              >
                {example.label}
              </Link>
            </li>
          ))}
        </ul>

        <form action="/admin/mcp" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            name="tool"
            defaultValue={selected.tool ?? "search_products"}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
          >
            {tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
          <input
            name="args"
            defaultValue={selected.args ?? '{"query": "wooden"}'}
            className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 font-mono text-sm dark:border-zinc-700"
          />
          <button className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            Call tool
          </button>
        </form>
      </section>

      {argsError && <p className="mt-6 text-sm text-red-600">{argsError}</p>}

      {result && (
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Result</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                result.isError
                  ? "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"
                  : "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
              }`}
            >
              {result.isError ? "isError: true" : "success"}
            </span>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-100 p-4 text-xs dark:bg-zinc-900">
            {block?.text ? JSON.stringify(JSON.parse(block.text), null, 2) : JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-medium">Tools Claude sees ({tools.length})</h2>
        <p className="text-sm text-zinc-500">The name, description and input schema are all Claude knows about a tool.</p>
        <ul className="mt-3 space-y-4">
          {tools.map((tool) => (
            <li key={tool.name} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="font-mono text-sm font-medium">{tool.name}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</p>
              <pre className="mt-2 overflow-x-auto text-xs text-zinc-500">
                {JSON.stringify(tool.inputSchema.properties ?? {}, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
