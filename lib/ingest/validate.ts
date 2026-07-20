/**
 * The top of the derivative ladder is 1800px (product.md §3.2). An original
 * narrower than that would make the top rung an UPSCALE, and the srcset `w`
 * descriptor would then lie about the file it serves. Print originals are
 * 6000px+, so this rejects nothing real.
 */
export const MIN_WIDTH_PX = 1800

/**
 * MUST equal the `originals` bucket's configured file-size limit in Supabase.
 * 50MB is Supabase's documented default -- VERIFY it against the dashboard
 * (Storage -> originals -> Settings) and correct this if it differs.
 *
 * Checked BEFORE the signed URL is issued, so an oversize file is refused in a
 * millisecond instead of after a 40MB transfer with an opaque storage error.
 */
export const MAX_UPLOAD_BYTES = 52_428_800

/** Everything sharp can decode and we are willing to store. */
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'] as const

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
  'image/webp': 'webp',
}

export type Accepted = { ok: true }
export type Rejection = { ok: false; message: string }

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(0)} MB`
}

export function validateUpload({ mime, bytes }: { mime: string; bytes: number }): Accepted | Rejection {
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { ok: false, message: 'That file isn’t an image this can read. Use JPEG, PNG, TIFF or WebP.' }
  }
  if (bytes <= 0) {
    return { ok: false, message: 'That file is empty.' }
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `That file is too large — the limit is ${mb(MAX_UPLOAD_BYTES)}.` }
  }
  return { ok: true }
}

export function validateDimensions(widthPx: number): Accepted | Rejection {
  if (widthPx < MIN_WIDTH_PX) {
    return {
      ok: false,
      message: `That photograph is ${widthPx}px wide. The largest size served is ${MIN_WIDTH_PX}px, so anything narrower would be scaled up. Upload the full-resolution original.`,
    }
  }
  return { ok: true }
}

export function extensionFor(mime: string): string {
  return EXTENSION[mime] ?? 'bin'
}
