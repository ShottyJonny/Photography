export interface CropInsets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface CropGuideResult {
  insetPct: CropInsets
  label: string
}

export const SIZE_ASPECT: Record<string, number> = {
  '4x6': 2 / 3,
  '5x7': 5 / 7,
  '8x10': 4 / 5,
  '11x14': 11 / 14,
  '12x16': 3 / 4,
  '16x20': 4 / 5,
  '20x30': 2 / 3,
}

const ASPECT_EPSILON = 0.01

function formatLabel(size: string, isLandscape: boolean): string {
  const [w, h] = size.split('x')
  if (!w || !h) {
    return size
  }
  return isLandscape ? `${h}×${w}` : `${w}×${h}`
}

export function cropGuide(plateAspect: number, size: string): CropGuideResult {
  const isLandscape = plateAspect > 1
  const sizeAspect = SIZE_ASPECT[size]

  if (sizeAspect === undefined) {
    return {
      insetPct: { top: 0, bottom: 0, left: 0, right: 0 },
      label: formatLabel(size, isLandscape),
    }
  }

  const targetAspect = isLandscape ? 1 / sizeAspect : sizeAspect
  const label = formatLabel(size, isLandscape)

  if (Math.abs(targetAspect - plateAspect) <= ASPECT_EPSILON) {
    return {
      insetPct: { top: 0, bottom: 0, left: 0, right: 0 },
      label,
    }
  }

  if (targetAspect > plateAspect) {
    const inset = ((1 - plateAspect / targetAspect) / 2) * 100
    return {
      insetPct: { top: inset, bottom: inset, left: 0, right: 0 },
      label,
    }
  }

  const inset = ((1 - targetAspect / plateAspect) / 2) * 100
  return {
    insetPct: { top: 0, bottom: 0, left: inset, right: inset },
    label,
  }
}
