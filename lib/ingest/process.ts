import 'server-only'
import sharp from 'sharp'
import { derivativePlan } from '@/lib/ingest/plan'
import type { DerivativeFormat, Register } from '@/lib/ingest/keys'

export interface Measured {
  widthPx: number
  heightPx: number
  aspectRatio: number
  aura: { r: number; g: number; b: number }
}

export interface EncodedObject {
  key: string
  body: Buffer
  contentType: string
}

const CONTENT_TYPE: Record<DerivativeFormat, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
}

/**
 * Measured once, at ingest -- which is the whole reason this slice exists for
 * the crop guide. lib/product/crop.ts has been running on Plate.tsx's hardcoded
 * 0.8 fallback because nothing ever wrote photos.aspect_ratio.
 *
 * aspectRatio is width/height, so portrait is < 1. crop.ts reads `> 1` as
 * landscape; inverting this rotates every crop guide on the storefront.
 */
export async function measure(input: Buffer): Promise<Measured> {
  const image = sharp(input, { limitInputPixels: false })
  const meta = await image.metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Could not read the image’s dimensions.')
  }
  const stats = await image.stats()
  const { r, g, b } = stats.dominant
  return {
    widthPx: meta.width,
    heightPx: meta.height,
    aspectRatio: meta.width / meta.height,
    aura: { r, g, b },
  }
}

/**
 * One register's full ladder, in memory. The caller uploads them.
 *
 * Sequential, not Promise.all: sharp already uses a thread pool per operation,
 * and twelve concurrent decodes of a 40MB source is how a serverless function
 * meets its memory limit instead of its time limit.
 *
 * .toColourspace('srgb') is INSURANCE, not a fix -- spec §6 measured the real
 * archive as already sRGB. It costs one line and covers the day an export
 * arrives in Display P3, which fails silently rather than loudly.
 */
export async function encodeLadder(
  input: Buffer,
  slug: string,
  register: Register,
): Promise<EncodedObject[]> {
  const objects: EncodedObject[] = []

  for (const job of derivativePlan(slug, register)) {
    const pipeline = sharp(input, { limitInputPixels: false })
      // withoutEnlargement is belt-and-braces: validateDimensions already
      // guarantees the source is >= 1800px, so no rung should ever upscale.
      .resize(job.width, null, { withoutEnlargement: true })
      .toColourspace('srgb')

    const body =
      job.format === 'avif'
        ? await pipeline.avif({ quality: job.quality }).toBuffer()
        : await pipeline.webp({ quality: job.quality }).toBuffer()

    objects.push({ key: job.key, body, contentType: CONTENT_TYPE[job.format] })
  }

  return objects
}
