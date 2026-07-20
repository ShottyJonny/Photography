import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { measure, encodeLadder } from '@/lib/ingest/process'
import { DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'

// 2400x3000 (4:5). Above MIN_WIDTH_PX so the full ladder is a genuine
// downscale, small enough that the whole suite stays fast.
let source: Buffer

beforeAll(async () => {
  source = await sharp({
    create: { width: 2400, height: 3000, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}, 30_000)

describe('measure', () => {
  it('reports the real pixel dimensions', async () => {
    const m = await measure(source)
    expect(m.widthPx).toBe(2400)
    expect(m.heightPx).toBe(3000)
  })

  it('computes aspect ratio as width/height, so portrait is < 1', async () => {
    // lib/product/crop.ts treats plateAspect > 1 as landscape. Inverting this
    // would rotate every crop guide on the storefront.
    const m = await measure(source)
    expect(m.aspectRatio).toBeCloseTo(0.8, 4)
  })

  it('returns the aura as a single {r,g,b}', async () => {
    // design.md §10 q3: the shape legacy averageColor() returned. Nothing reads
    // it; it is stored because the file is in hand.
    const m = await measure(source)
    expect(Object.keys(m.aura).sort()).toEqual(['b', 'g', 'r'])
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(m.aura[channel]).toBeGreaterThanOrEqual(0)
      expect(m.aura[channel]).toBeLessThanOrEqual(255)
    }
  })
})

describe('encodeLadder', () => {
  let objects: Awaited<ReturnType<typeof encodeLadder>>

  beforeAll(async () => {
    objects = await encodeLadder(source, 'evil-lies', 'colour')
  }, 60_000)

  it('emits every width in both formats', () => {
    expect(objects).toHaveLength(DERIVATIVE_WIDTHS.length * 2)
  })

  it('writes to the keys the storefront requests', () => {
    expect(objects.map((o) => o.key)).toContain('evil-lies/colour/1800.avif')
    expect(objects.map((o) => o.key)).toContain('evil-lies/colour/160.webp')
  })

  it('sets a content type matching the format', () => {
    expect(objects.find((o) => o.key.endsWith('.avif'))!.contentType).toBe('image/avif')
    expect(objects.find((o) => o.key.endsWith('.webp'))!.contentType).toBe('image/webp')
  })

  it('EVERY output decodes to exactly the width in its filename', async () => {
    // The upscale trap. Six files existing does not mean six correct files, and
    // a srcset `w` descriptor that disagrees with the actual pixel width makes
    // the browser choose wrong on every viewport.
    for (const object of objects) {
      const declared = Number(object.key.match(/\/(\d+)\.(?:avif|webp)$/)![1])
      const meta = await sharp(object.body).metadata()
      expect(meta.width, `${object.key} decoded to ${meta.width}, declared ${declared}`).toBe(declared)
    }
  }, 60_000)

  it('preserves aspect ratio at every rung', async () => {
    for (const object of objects) {
      const meta = await sharp(object.body).metadata()
      expect(meta.width! / meta.height!).toBeCloseTo(0.8, 2)
    }
  }, 60_000)

  it('round-trips an sRGB source without corrupting it', async () => {
    // NOT a wide-gamut assertion -- see the note in the plan and spec §6. A
    // synthetic P3 source cannot be built with withMetadata({icc:'p3'}), so
    // such a test cannot fail. This one can: it catches a colour-space
    // conversion that mangles ordinary sRGB input.
    const plate = objects.find((o) => o.key === 'evil-lies/colour/1800.webp')!
    const meta = await sharp(plate.body).metadata()
    expect(meta.space).toBe('srgb')

    const { data } = await sharp(plate.body).resize(1, 1).raw().toBuffer({ resolveWithObject: true })
    // The source is a flat (120, 90, 60). Allow generous slack for lossy encode.
    expect(Math.abs(data[0] - 120)).toBeLessThan(12)
    expect(Math.abs(data[1] - 90)).toBeLessThan(12)
    expect(Math.abs(data[2] - 60)).toBeLessThan(12)
  }, 30_000)
})
