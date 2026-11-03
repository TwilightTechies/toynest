import Link from "next/link";

const sections = [
  { href: "/products", title: "Products", body: "The sample catalogue, read through the core repository ports." },
  {
    href: "/admin/drafts",
    title: "Admin · AI drafts",
    body: "A product draft waiting for review, with the facts the assistant refused to invent.",
  },
  {
    href: "/admin/mcp",
    title: "Admin · MCP explorer",
    body: "Call the ToyNest MCP server's tools and see results and structured errors.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">ToyNest</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Toys, personalised toys and stationery.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="block h-full rounded-lg border border-zinc-200 p-5 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="font-medium">{section.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{section.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
