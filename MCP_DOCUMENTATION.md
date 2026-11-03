# ToyNest MCP server

`apps/mcp-server` exposes the ToyNest catalogue to any MCP client (Claude Code, the Agent SDK,
the admin MCP explorer page). It is **read-only**: no tool creates or changes data.

## Running it

| How | Command |
|---|---|
| Claude Code | Configured in `.mcp.json` (project scope, committed). Approve the `toynest` server when Claude Code asks |
| By hand | `npm run start -w @toynest/mcp-server` (speaks MCP over stdio; logs go to stderr) |
| Browser | `npm run dev`, then <http://localhost:3000/admin/mcp> |

`.mcp.json` contains no secrets. Values come from each developer's environment through
`${VAR}` expansion, e.g. `TOYNEST_CATALOG_PATH` (defaults to `data/sample-catalog.json`).

## Tools

| Tool | Input | Returns |
|---|---|---|
| `get_categories` | none | Categories with slug, name and required attributes |
| `search_products` | `query?`, `categorySlug?`, `limit` (1–10, default 5) | `{ total, items[] }` with slug, name, categorySlug, priceMinor |
| `get_product` | `slug` | `{ found: true, product }` or `{ found: false, slug }` |

## Resources

| URI | Content |
|---|---|
| `toynest://categories` | The same category list as `get_categories`, readable up front so Claude does not have to discover it with tool calls |

## Error contract

A failed call returns `isError: true` and one text block containing JSON:

```json
{ "errorCategory": "validation", "isRetryable": false, "message": "Unknown categorySlug 'toys'. Valid slugs: ..." }
```

| errorCategory | Meaning | isRetryable |
|---|---|---|
| `transient` | The catalogue could not be read (e.g. a timeout) | true |
| `validation` | The input is wrong; the message says how to fix it | false |
| `permission` | Reserved for tools that need an authorised caller | false |
| `business_rule` | Reserved for policy limits | false |

**No results is not an error.** An empty search returns `{ total: 0, items: [] }` and an unknown slug
returns `{ found: false }`, both with `isError` unset. A failure is never disguised as an empty result.
