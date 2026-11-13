import {
  LARGE_IMAGE_EDGE,
  MIN_IMAGE_EDGE,
  SMALL_IMAGE_EDGE,
  type ImageProcessingResult,
  type ImageProcessor,
  type ProcessedImage,
} from "@toynest/core";
import sharp, { type Metadata } from "sharp";

// 40 megapixels: well above any phone photo (a 48 MP sensor saves 12 MP by default), and a hard stop
// for "decompression bomb" files that are small on disk but huge once decoded.
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const WEBP_QUALITY = 80;

// ADR-017. Resizes once at upload, so the shop never needs a paid image-transformation service.
export function createSharpImageProcessor(): ImageProcessor {
  const open = (bytes: Uint8Array) => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });

  async function render(bytes: Uint8Array, edge: number): Promise<ProcessedImage> {
    const { data, info } = await open(bytes)
      // Applies the EXIF orientation, so phone photos aren't sideways once the EXIF is gone.
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      // sharp drops all metadata unless asked to keep it: no GPS location, camera serial or EXIF.
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  }

  return {
    async process(bytes): Promise<ImageProcessingResult> {
      let metadata: Metadata;
      try {
        // Reads the header only. The format comes from the file's contents, not its name or MIME type.
        metadata = await sharp(bytes).metadata();
      } catch {
        return { ok: false, reason: "unsupported_format" };
      }
      if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) return { ok: false, reason: "unsupported_format" };
      const { width = 0, height = 0 } = metadata.autoOrient ?? metadata;
      if (width * height > MAX_INPUT_PIXELS) return { ok: false, reason: "too_many_pixels" };
      if (Math.min(width, height) < MIN_IMAGE_EDGE) return { ok: false, reason: "too_small" };

      try {
        const [large, small] = await Promise.all([render(bytes, LARGE_IMAGE_EDGE), render(bytes, SMALL_IMAGE_EDGE)]);
        return { ok: true, large, small };
      } catch {
        // A truncated or corrupt file can have a valid header and still fail to decode.
        return { ok: false, reason: "unreadable" };
      }
    },
  };
}
