import { deriveSlug } from '@/lib/ingest/slug'

export interface SourceFile {
  basename: string
  colourPath: string
  silverPath: string | null
}

export interface ImportDecision {
  slug: string
  title: string
  action: 'create' | 'skip'
  reason?: 'exists'
  hasSilver: boolean
  colourPath: string
  silverPath: string | null
}

/** Pure: decide create-vs-skip per file. The runner does the IO. */
export function planImports(files: SourceFile[], existingSlugs: Set<string>): ImportDecision[] {
  return files.map((f) => {
    const slug = deriveSlug(f.basename)
    const exists = existingSlugs.has(slug)
    return {
      slug,
      title: f.basename,
      action: exists ? 'skip' : 'create',
      ...(exists ? { reason: 'exists' as const } : {}),
      hasSilver: f.silverPath !== null,
      colourPath: f.colourPath,
      silverPath: f.silverPath,
    }
  })
}
