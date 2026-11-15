import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConflictError, SlugTakenError } from "../errors";
import type { ProductAdminRepository } from "../ports/product-admin-repository";
import type { Category } from "./category";
import type { ProductStatus } from "./product";
import {
  attributeLabel,
  checkPublishable,
  formatRupeesInput,
  parseRupees,
  slugify,
  type AdminProduct,
  type ProductInput,
} from "./product-admin";
import { createProductAdminService } from "./product-admin-service";

const toys: Category = { id: randomUUID(), slug: "toys", name: "Toys", requiredAttributes: ["ageRange", "material"], visible: true, sortOrder: 0, menuLabel: null };

const completeInput = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: "Wooden Rainbow Stacker",
  slug: "wooden-rainbow-stacker",
  description: "Seven arches.",
  categoryId: toys.id,
  priceMinor: 89900,
  attributes: { ageRange: "1-3 years", material: "Wood" },
  ...overrides,
});

describe("slugify", () => {
  it.each([
    ["Wooden Rainbow Stacker", "wooden-rainbow-stacker"],
    ["  Crème brûlée  set!! ", "creme-brulee-set"],
    ["A--B__C", "a-b-c"],
    ["!!!", ""],
  ])("%s → %s", (name, slug) => expect(slugify(name)).toBe(slug));

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("parseRupees", () => {
  it.each([
    ["599", 59900],
    ["1,299", 129900],
    ["₹ 1299.5", 129950],
    ["0.29", 29],
    ["0", 0],
    ["1000000", 100000000],
  ])("%s → %d paise", (text, minor) => expect(parseRupees(text)).toBe(minor));

  it.each(["", "abc", "-5", "1.999", "1e3", "10000001", "12.", ".5"])("rejects %j", (text) =>
    expect(parseRupees(text)).toBeNull(),
  );

  it("round-trips with formatRupeesInput", () => {
    for (const minor of [0, 5, 59900, 129950]) expect(parseRupees(formatRupeesInput(minor))).toBe(minor);
  });
});

describe("checkPublishable", () => {
  it("passes a complete product", () => expect(checkPublishable(completeInput(), toys)).toEqual([]));

  it("names every missing required attribute and a zero price", () => {
    const problems = checkPublishable(completeInput({ priceMinor: 0, attributes: { material: "  " } }), toys);
    expect(problems).toEqual([
      "Set a price above ₹0",
      'Fill in "Age range" (required for Toys)',
      'Fill in "Material" (required for Toys)',
    ]);
  });

  it("labels camelCase attributes for people", () => expect(attributeLabel("ageRange")).toBe("Age range"));
});

// Minimal fake that behaves like the adapter: versions change on every write, slugs are unique.
function fakeRepository(): ProductAdminRepository & { rows: Map<string, AdminProduct> } {
  const rows = new Map<string, AdminProduct>();
  let clock = 0;
  const stamp = () => `v${++clock}`;
  const assertSlugFree = (slug: string, id?: string) => {
    if ([...rows.values()].some((row) => row.slug === slug && row.id !== id)) throw new SlugTakenError(slug);
  };
  const save = (id: string, change: Partial<AdminProduct>, expected: string) => {
    const row = rows.get(id);
    if (!row || row.version !== expected) throw new ConflictError();
    const next = { ...row, ...change, version: stamp() };
    rows.set(id, next);
    return next;
  };
  return {
    rows,
    async list() {
      return { items: [...rows.values()], total: rows.size };
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async create(input) {
      assertSlugFree(input.slug);
      const now = new Date().toISOString();
      const row: AdminProduct = { ...input, id: randomUUID(), currency: "INR", status: "draft", createdAt: now, updatedAt: now, version: stamp() };
      rows.set(row.id, row);
      return row;
    },
    async update(id, input, expected) {
      assertSlugFree(input.slug, id);
      return save(id, input, expected);
    },
    async setStatus(id, status: ProductStatus, expected) {
      return save(id, { status }, expected);
    },
  };
}

function setup() {
  const repo = fakeRepository();
  const service = createProductAdminService(repo, { list: async () => [toys] });
  return { repo, service };
}

describe("product admin service", () => {
  it("creates every product as a draft, even an incomplete one", async () => {
    const { service } = setup();
    const result = await service.create(completeInput({ priceMinor: 0, attributes: {} }));
    expect(result.ok && result.product.status).toBe("draft");
  });

  it("rejects invalid input and unknown categories with readable problems", async () => {
    const { service } = setup();
    expect(await service.create(completeInput({ name: " " }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await service.create(completeInput({ categoryId: randomUUID() }))).toEqual({
      ok: false,
      reason: "invalid",
      problems: ["Choose a category"],
    });
  });

  it("reports a duplicate slug", async () => {
    const { service } = setup();
    await service.create(completeInput());
    expect(await service.create(completeInput())).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("blocks publishing until the publish rule passes, then publishes", async () => {
    const { service } = setup();
    const created = await service.create(completeInput({ attributes: { ageRange: "1-3 years" } }));
    if (!created.ok) throw new Error("create failed");

    const blocked = await service.changeStatus(created.product.id, "publish", created.product.version);
    expect(blocked).toEqual({ ok: false, reason: "invalid", problems: ['Fill in "Material" (required for Toys)'] });

    const fixed = await service.update(created.product.id, completeInput(), created.product.version);
    if (!fixed.ok) throw new Error("update failed");
    const published = await service.changeStatus(fixed.product.id, "publish", fixed.product.version);
    expect(published.ok && published.product.status).toBe("active");
  });

  it("keeps a live product complete when it is edited", async () => {
    const { service } = setup();
    const created = await service.create(completeInput());
    if (!created.ok) throw new Error("create failed");
    const live = await service.changeStatus(created.product.id, "publish", created.product.version);
    if (!live.ok) throw new Error("publish failed");

    const edit = await service.update(live.product.id, completeInput({ attributes: { ageRange: "1-3 years" } }), live.product.version);
    expect(edit).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a stale version instead of overwriting the newer edit", async () => {
    const { service } = setup();
    const created = await service.create(completeInput());
    if (!created.ok) throw new Error("create failed");
    const staleVersion = created.product.version;

    expect((await service.update(created.product.id, completeInput({ name: "Tab one" }), staleVersion)).ok).toBe(true);
    expect(await service.update(created.product.id, completeInput({ name: "Tab two" }), staleVersion)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(await service.changeStatus(created.product.id, "archive", staleVersion)).toEqual({ ok: false, reason: "conflict" });
  });

  it("only allows the listed status moves; restore goes back to draft", async () => {
    const { service } = setup();
    const created = await service.create(completeInput());
    if (!created.ok) throw new Error("create failed");

    expect(await service.changeStatus(created.product.id, "restore", created.product.version)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    const archived = await service.changeStatus(created.product.id, "archive", created.product.version);
    if (!archived.ok) throw new Error("archive failed");
    const restored = await service.changeStatus(archived.product.id, "restore", archived.product.version);
    expect(restored.ok && restored.product.status).toBe("draft");
  });

  it("reports an unknown id as not found", async () => {
    const { service } = setup();
    expect(await service.changeStatus(randomUUID(), "publish", "v1")).toEqual({ ok: false, reason: "not_found" });
  });
});
