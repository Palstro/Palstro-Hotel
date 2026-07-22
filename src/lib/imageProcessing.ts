// Client-side image processing — runs entirely in the browser BEFORE any network
// call. The whole point is cost control: egress is the bill, so we never let an
// 8MB phone photo reach the bucket. Instead we resize to three capped widths and
// re-encode as WebP, so the browser uploads (and later re-serves) a fraction of
// the bytes.
//
// The numbers, and why they hit the target:
//   A typical phone photo is ~8MB and ~4000x3000 JPEG. Re-encoding the FULL
//   variant to 1920px-wide WebP at quality 0.82 lands around ~200KB — a ~40x
//   reduction — because WebP at 0.82 is visually lossless at screen scale and
//   1920px is already larger than any slot the guest site renders. thumb (400px)
//   and card (800px) are proportionally smaller again (~15KB / ~50KB). A room
//   CARD must never pull the full variant (see mediaUrl.ts) — that is the egress
//   saving made real at read time.
//
// Never upscales: a source narrower than a target width is emitted at its own
// size, so we never invent detail or inflate bytes.

import type { SizeVariant } from '../types/media';

// Hard ceiling on the input file, matched to the bucket's file_size_limit in
// 005_storage.sql. Enforced here first so a too-large file is rejected instantly,
// with a friendly message, before any decode work or network call.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// WebP quality for every variant. 0.82 is the sweet spot: visually clean at
// screen scale while cutting bytes dramatically versus the source JPEG/PNG.
export const WEBP_QUALITY = 0.82;

// The input types we can decode to a canvas AND that the bucket accepts. Kept in
// lockstep with allowed_mime_types in 005_storage.sql. (Output is always WebP.)
export const ACCEPTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// SizeVariant's canonical definition is the media domain vocabulary in
// types/media (shared with the media_assets row type). Re-exported here so
// callers importing from imageProcessing still get it; this module owns the
// pixel WIDTH each size maps to below.
export type { SizeVariant };

// Target MAX width per variant, in CSS pixels. Height follows from aspect ratio.
export const VARIANT_WIDTHS: Record<SizeVariant, number> = {
  thumb: 400,
  card: 800,
  full: 1920,
};

// Emitted in display order (smallest first) so callers iterate predictably.
export const SIZE_VARIANTS: SizeVariant[] = ['thumb', 'card', 'full'];

export interface ProcessedVariant {
  size: SizeVariant;
  blob: Blob; // image/webp
  width: number; // actual output width (<= VARIANT_WIDTHS[size])
  height: number; // actual output height
  byteSize: number; // blob.size, the bytes that will be uploaded
}

export interface ProcessedImage {
  variants: ProcessedVariant[];
  originalFilename: string;
  originalByteSize: number;
}

// A validation failure the UI can show verbatim. Thrown for the two reject cases
// (wrong type, too large) so the caller can distinguish "user picked a bad file"
// from an unexpected decode/encode error.
export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

// Validate the raw file up front — cheap checks, clear messages, no work done
// until they pass. Reject anything that is not one of the accepted image types,
// and anything over the size ceiling.
function validate(file: File): void {
  if (!(ACCEPTED_INPUT_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageValidationError(
      'That file is not a supported image. Please choose a JPEG, PNG or WebP.',
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError(
      `That image is ${humanBytes(file.size)}, over the ${humanBytes(
        MAX_UPLOAD_BYTES,
      )} limit. Please choose a smaller file.`,
    );
  }
}

// Encode a canvas to a WebP Blob, promisified. Prefers OffscreenCanvas
// (convertToBlob, off the main thread) and falls back to HTMLCanvasElement
// (toBlob). Rejects if the browser hands back a null blob rather than silently
// producing a zero-byte upload.
async function canvasToWebp(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  }
  const el = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    el.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image to WebP.'));
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

// Draw the decoded bitmap into a canvas at (w, h) and encode one WebP variant.
async function renderVariant(
  bitmap: ImageBitmap,
  size: SizeVariant,
  width: number,
  height: number,
): Promise<ProcessedVariant> {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
  } else {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    canvas = el;
    ctx = el.getContext('2d');
  }
  if (!ctx) throw new Error('Could not get a 2D drawing context.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high'; // better downscale quality
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToWebp(canvas);
  return { size, blob, width, height, byteSize: blob.size };
}

/**
 * Decode `file` and produce the three WebP variants (thumb/card/full), each
 * preserving aspect ratio and never upscaling.
 *
 * Throws ImageValidationError for a wrong type or an over-limit file (both
 * caught before any decode), and a plain Error if decode/encode fails. Every
 * caller must await this and surface the message (rule 11) — nothing here
 * swallows a failure.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  validate(file);

  // imageOrientation 'from-image' respects EXIF orientation, so a portrait phone
  // photo is not stored sideways. createImageBitmap decodes off the main thread.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const variants: ProcessedVariant[] = [];
    for (const size of SIZE_VARIANTS) {
      // scale <= 1 always: min() clamps so we never upscale a small source.
      const scale = Math.min(1, VARIANT_WIDTHS[size] / bitmap.width);
      // At least 1px guards a degenerate 0-dimension canvas.
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      variants.push(await renderVariant(bitmap, size, width, height));
    }
    return {
      variants,
      originalFilename: file.name,
      originalByteSize: file.size,
    };
  } finally {
    // Release the decoded bitmap's memory regardless of success/failure.
    bitmap.close();
  }
}
