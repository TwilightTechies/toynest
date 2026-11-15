import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConflictError, SlugTakenError } from "../errors";
import type { CategoryAdminRepository } from "../ports/category-admin-repository";
import { attributeKey, parseRequiredAttributes, type AdminCategory, type CategoryInput } from "./category-admin";
import { createCategoryAdminService } from "./category-admin-service";
import { attributeLabel } from "./product-admin";

describe("attribute keys", () => {
  it.each([
    ["Learning focus", "learningFocus"],
    ["  size ", "size"],
    ["Age range (years)", "ageRangeYears"],
    ["Crème colour", "cremeColour"],
  ])("%s → %s", (label, key) => expect(attributeKey(label)).toBe(key));

  it("round-trips with attributeLabel for existing keys", () => {
    for (const key of ["ageRange", "material", "learningFocus", "personalisationOptions"]) {
      expect(attributeKey(attributeLabel(key))).toBe(key);
    }
  });

  it("parses comma or line separated labels, dropping blanks and duplicates", () =>
    expect(parseRequiredAttributes("Material, size\nMaterial,, ")).toEqual(["material", "size"]));
});

function fakeRepository(): CategoryAdminRepository & { rows: AdminCategory[] } {
  const rows: AdminCategory[] = [];
  let clock = 0;
  const stamp = () => `v${++clock}`;
  const save = (id: string, change: Partial<AdminCategory>, expected: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.version !== expected) throw new ConflictError();
    Object.assign(row, change, { version: stamp() });
    return { ...row };
  };
  return {
    rows,
    async list() {
      return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async create(input) {
      if (rows.some((r) => r.slug === input.slug)) throw new SlugTakenError(input.slug);
      const row: AdminCategory = { id: randomUUID(), ...input, visible: false, sortOrder: rows.length, productCount: 0, version: stamp() };
      rows.push(row);
      return { ...row };
    },
    async update(id, input, expected) {
      return save(id, input, expected);
    },
    async setVisible(id, visible, expected) {
      return save(id, { visible }, expected);
    },
    async reorder(ids) {
      ids.forEach((id, index) => {
        const row = rows.find((r) => r.id === id);
        if (row) row.sortOrder = index;
      });
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
  };
}

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: "Christmas decorations",
  slug: "christmas-decorations",
  menuLabel: "Christmas",
  requiredAttributes: ["material", "size"],
  ...overrides,
});

describe("category admin service", () => {
  it("creates a category (hidden until an admin shows it)", async () => {
    const service = createCategoryAdminService(fakeRepository());
    const created = await service.create(input());
    expect(created).toMatchObject({ ok: true, value: { slug: "christmas-decorations", visible: false, menuLabel: "Christmas" } });
  });

  it("treats a blank menu label as 'use the name'", async () => {
    const service = createCategoryAdminService(fakeRepository());
    expect(await service.create(input({ menuLabel: "  " }))).toMatchObject({ ok: true, value: { menuLabel: null } });
  });

  it("rejects bad input with readable problems, and a duplicate slug", async () => {
    const service = createCategoryAdminService(fakeRepository());
    expect(await service.create(input({ name: "" }))).toMatchObject({ ok: false, reason: "invalid", problems: ["Enter a name"] });
    expect(await service.create(input({ requiredAttributes: ["size", "size"] }))).toMatchObject({ ok: false, reason: "invalid" });
    await service.create(input());
    expect(await service.create(input())).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("keeps the slug fixed on update and refuses a stale version", async () => {
    const repo = fakeRepository();
    const service = createCategoryAdminService(repo);
    const created = await service.create(input());
    if (!created.ok) throw new Error("create failed");
    const updated = await service.update(created.value.id, { name: "Christmas", menuLabel: null, requiredAttributes: ["material"] }, created.value.version);
    expect(updated).toMatchObject({ ok: true, value: { name: "Christmas", slug: "christmas-decorations", requiredAttributes: ["material"] } });
    expect(await service.setVisible(created.value.id, true, created.value.version)).toEqual({ ok: false, reason: "conflict" });
  });

  it("shows and hides", async () => {
    const service = createCategoryAdminService(fakeRepository());
    const created = await service.create(input());
    if (!created.ok) throw new Error("create failed");
    const shown = await service.setVisible(created.value.id, true, created.value.version);
    expect(shown).toMatchObject({ ok: true, value: { visible: true } });
  });

  it("moves by swapping neighbours; the ends are no-ops", async () => {
    const repo = fakeRepository();
    const service = createCategoryAdminService(repo);
    for (const slug of ["a", "b", "c"]) await service.create(input({ name: slug.toUpperCase(), slug }));
    const c = repo.rows.find((r) => r.slug === "c")!;
    await service.move(c.id, "up");
    await service.move(c.id, "up");
    await service.move(c.id, "up");
    expect((await repo.list()).map((r) => r.slug)).toEqual(["c", "a", "b"]);
  });

  it("refuses to delete a category that products use; deletes an empty one", async () => {
    const repo = fakeRepository();
    const service = createCategoryAdminService(repo);
    const created = await service.create(input());
    if (!created.ok) throw new Error("create failed");
    repo.rows[0]!.productCount = 3;
    expect(await service.remove(created.value.id)).toEqual({ ok: false, reason: "in_use", productCount: 3 });
    repo.rows[0]!.productCount = 0;
    expect(await service.remove(created.value.id)).toEqual({ ok: true, value: null });
    expect(await service.remove(created.value.id)).toEqual({ ok: false, reason: "not_found" });
  });
});
