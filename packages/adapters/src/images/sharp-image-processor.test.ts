import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createSharpImageProcessor } from "./sharp-image-processor";

const processor = createSharpImageProcessor();

const photo = (width: number, height: number, format: "jpeg" | "png" | "webp" | "gif" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .toFormat(format)
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

describe("sharp image processor", () => {
  it("turns a large JPEG into a 1600 px and a 480 px WebP", async () => {
    const result = await processor.process(await photo(4000, 3000));
    if (!result.ok) throw new Error(result.reason);
    expect([result.large.width, result.large.height]).toEqual([1600, 1200]);
    expect([result.small.width, result.small.height]).toEqual([480, 360]);
    expect((await sharp(result.large.bytes).metadata()).format).toBe("webp");
    expect((await sharp(result.small.bytes).metadata()).format).toBe("webp");
  });

  it("accepts PNG and WebP, and never enlarges a small-but-allowed photo", async () => {
    for (const format of ["png", "webp"] as const) {
      const result = await processor.process(await photo(800, 600, format));
      if (!result.ok) throw new Error(result.reason);
      expect([result.large.width, result.large.height]).toEqual([800, 600]);
    }
  });

  it("applies EXIF rotation and strips the metadata", async () => {
    // A landscape 1200x800 frame tagged "rotate 90°" (orientation 6), as phones save portrait shots.
    const tagged = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#888" } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-camera-serial" } } })
      .toBuffer();
    const result = await processor.process(new Uint8Array(tagged));
    if (!result.ok) throw new Error(result.reason);
    expect([result.large.width, result.large.height]).toEqual([800, 1200]);
    const meta = await sharp(result.large.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("rejects photos under 400 px on the short side", async () =>
    expect(await processor.process(await photo(1200, 300))).toEqual({ ok: false, reason: "too_small" }));

  it("rejects GIF, SVG and plain text even if they claim to be a JPEG", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>');
    const text = new TextEncoder().encode("definitely not a photo.jpg");
    for (const bytes of [await photo(800, 800, "gif"), svg, text]) {
      expect(await processor.process(bytes)).toEqual({ ok: false, reason: "unsupported_format" });
    }
  });

  it("rejects a truncated JPEG whose header is still valid", async () => {
    const full = await photo(1200, 900);
    const result = await processor.process(full.slice(0, Math.floor(full.length / 3)));
    expect(result.ok).toBe(false);
  });
});
