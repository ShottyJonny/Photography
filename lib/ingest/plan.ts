import { DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'
import { derivativeKey, type DerivativeFormat, type Register } from '@/lib/ingest/keys'

/**
 * Encode quality, split by what the width is actually FOR.
 *
 * sharp's AVIF default is q50, which is visibly soft on an 1800px plate for a
 * print portfolio. The 160 is the home bleed -- blurred 90px and scaled 1.12
 * (product.md §3.2) -- where quality is invisible and bytes are not.
 */
export const QUALITY = {
  small: { avif: 45, webp: 72 },
  plate: { avif: 62, webp: 82 },
} as const

/** Widths at or below this use the cheaper quality tier. */
const SMALL_MAX_WIDTH = 400

export interface DerivativeJob {
  key: string
  width: number
  format: DerivativeFormat
  quality: number
}

export function derivativePlan(slug: string, register: Register): DerivativeJob[] {
  const jobs: DerivativeJob[] = []
  for (const width of DERIVATIVE_WIDTHS) {
    const tier = width <= SMALL_MAX_WIDTH ? QUALITY.small : QUALITY.plate
    for (const format of ['avif', 'webp'] as const) {
      jobs.push({ key: derivativeKey(slug, register, width, format), width, format, quality: tier[format] })
    }
  }
  return jobs
}

/**
 * The manifest finishIngest checks the bucket against before it will set
 * derivatives_ready. This is what makes "every derivative exists" a verifiable
 * claim rather than an assumption.
 */
export function expectedObjects(slug: string, hasBwVariant: boolean): string[] {
  const registers: Register[] = hasBwVariant ? ['colour', 'silver'] : ['colour']
  return registers.flatMap((register) => derivativePlan(slug, register).map((job) => job.key))
}
