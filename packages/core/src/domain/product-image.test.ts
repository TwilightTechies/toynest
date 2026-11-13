import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../errors";
import type { ImageProcessor, ImageProcessingResult } from "../ports/image-processor";
import type { ProductAdminRepository } from "../ports/product-admin-repository";
import type { ProductImageAdminRepository } from "../ports/product-image-repository";
import type { AdminProduct } from "./product-admin";
import { defaultAltText, MAX_UPLOAD_BYTES, smallImageWidth, type ProductImage } from "./product-image";
import { createProductImageService } from "./product-image-service";

const product: AdminProduct = {
  id: randomUUID(),
  slug: "wooden-stacker",
  name: "Wooden Stacker",
  description: "",
  categoryId: randomUUID(),
  priceMinor: 79900,
  currency: "INR",
  status: "draft",
  attributes: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: "v1",
};

const products = { get: async (id: string) => (id === product.id ? product : null) } as unknown as ProductAdminRepository;

const ok: ImageProcessingResult = {
  ok: true,
  large: { bytes: new Uint8Array(10), width: 1600, height: 1200 },
  small: { bytes: new Uint8Array(5), width: 480, height: 360 },
};

// Behaves like the adapter, including the database's cap (position 0..7 and unique per product).
function fakeImages(): ProductImageAdminRepository & { rows: ProductImage[] } {
  const rows: ProductImage[] = [];
  const sorted = (productId: string) => rows.filter((r) => r.productId === productId).sort((a, b) => a.position - b.position);
  return {
    rows,
    async list(productId) {
      return sorted(productId);
    },
    async add(image) {
      if (image.position > 7 || rows.some((r) => r.productId === image.productId && r.position === image.position)) {
        throw new ConflictError();
      }
      const row: ProductImage = {
        id: randomUUID(),
        productId: image.productId,
        alt: image.alt,
        position: image.position,
        width: image.large.width,
        height: image.large.height,
        urls: { large: "https://cdn.example/l.webp", small: "https://cdn.example/s.webp" },
      };
      rows.push(row);
      return row;
    },
    async updateAlt(id, alt) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.alt = alt;
      return row;
    },
    async reorder(productId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const row = rows.find((r) => r.id === id && r.productId === productId);
        if (row) row.position = index;
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

function setup(result: ImageProcessingResult = ok) {
  const images = fakeImages();
  const calls: number[] = [];
  const processor: ImageProcessor = {
    async process(bytes) {
      calls.push(bytes.byteLength);
      return result;
    },
  };
  return { images, calls, service: createProductImageService(images, products, processor) };
}

const upload = (service: ReturnType<typeof setup>["service"], alt?: string) =>
  service.upload(product.id, new Uint8Array(1000), alt);

describe("product image service", () => {
  it("stores the first photo at position 0 with a default alt text", async () => {
    const { service } = setup();
    const result = await upload(service);
    expect(result).toMatchObject({ ok: true, value: { position: 0, alt: "Wooden Stacker, photo 1" } });
  });

  it("rejects an oversized upload before decoding it", async () => {
    const { service, calls } = setup();
    expect(await service.upload(product.id, new Uint8Array(MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, reason: "too_large" });
    expect(calls).toEqual([]);
  });

  it("passes on the processor's rejection (e.g. not really an image)", async () => {
    const { service } = setup({ ok: false, reason: "unsupported_format" });
    expect(await upload(service)).toEqual({ ok: false, reason: "unsupported_format" });
  });

  it("stops at 8 photos", async () => {
    const { service, calls } = setup();
    for (let i = 0; i < 8; i++) expect((await upload(service)).ok).toBe(true);
    expect(await upload(service)).toEqual({ ok: false, reason: "limit_reached" });
    expect(calls).toHaveLength(8);
  });

  it("reports an unknown product and a blank or overlong alt text", async () => {
    const { service } = setup();
    expect(await service.upload(randomUUID(), new Uint8Array(10))).toEqual({ ok: false, reason: "not_found" });
    const created = await upload(service);
    if (!created.ok) throw new Error("upload failed");
    expect(await service.updateAlt(created.value.id, "   ")).toMatchObject({ ok: false, reason: "invalid_alt" });
    expect(await service.updateAlt(created.value.id, "x".repeat(201))).toMatchObject({ ok: false, reason: "invalid_alt" });
    expect(await service.updateAlt(created.value.id, "Stacker from the side")).toMatchObject({ ok: true, value: { alt: "Stacker from the side" } });
  });

  it("moves photos by swapping neighbours; the ends are no-ops", async () => {
    const { service, images } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await upload(service, `photo ${i}`);
      if (r.ok) ids.push(r.value.id);
    }
    await service.move(product.id, ids[2]!, "up");
    expect((await images.list(product.id)).map((i) => i.alt)).toEqual(["photo 0", "photo 2", "photo 1"]);
    await service.move(product.id, ids[0]!, "up");
    expect((await images.list(product.id)).map((i) => i.alt)).toEqual(["photo 0", "photo 2", "photo 1"]);
  });

  it("closes the gap after a delete, so the next upload takes the last position", async () => {
    const { service, images } = setup();
    const first = await upload(service, "a");
    await upload(service, "b");
    await upload(service, "c");
    if (!first.ok) throw new Error("upload failed");
    expect(await service.remove(product.id, first.value.id)).toEqual({ ok: true, value: null });
    expect((await images.list(product.id)).map((i) => [i.alt, i.position])).toEqual([["b", 0], ["c", 1]]);
    expect(await upload(service, "d")).toMatchObject({ ok: true, value: { position: 2 } });
  });

  it("turns a lost race on the position into 'busy'", async () => {
    const { service, images } = setup();
    // Another request added a photo at position 0 between our list() and add().
    const list = images.list.bind(images);
    images.list = async () => [];
    await images.add({ productId: product.id, alt: "other", position: 0, large: ok.ok ? ok.large : (null as never), small: ok.ok ? ok.small : (null as never) });
    expect(await upload(service)).toEqual({ ok: false, reason: "busy" });
    images.list = list;
  });
});

describe("image helpers", () => {
  it("default alt text names the product and the photo number", () =>
    expect(defaultAltText("Wooden Stacker", 3)).toBe("Wooden Stacker, photo 3"));

  it("derives the small rendition's width from the large one", () => {
    expect(smallImageWidth({ width: 1600, height: 1200 })).toBe(480);
    expect(smallImageWidth({ width: 900, height: 1600 })).toBe(270);
    expect(smallImageWidth({ width: 400, height: 300 })).toBe(400);
  });
});
