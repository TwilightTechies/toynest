export interface ProcessedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type ImageRejection =
  // Not a JPEG, PNG or WebP, judged by the file's contents (not its name or declared type).
  | "unsupported_format"
  | "too_small"
  // More pixels than we will decode (protects the server from "decompression bomb" files).
  | "too_many_pixels"
  | "unreadable";

export type ImageProcessingResult =
  | { ok: true; large: ProcessedImage; small: ProcessedImage }
  | { ok: false; reason: ImageRejection };

// Turns an uploaded photo into the two stored renditions (ADR-017): checks the real format, applies
// EXIF rotation, strips metadata (e.g. GPS location) and resizes. Implemented with sharp in adapters.
export interface ImageProcessor {
  process(bytes: Uint8Array): Promise<ImageProcessingResult>;
}
