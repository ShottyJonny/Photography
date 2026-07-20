import type { Register } from '@/lib/ingest/keys'

export interface UploadDeclaration {
  mime: string
  bytes: number
}

export interface BeginInput {
  slug: string
  title: string
  colour: UploadDeclaration
  silver?: UploadDeclaration
}

export interface SignedTarget {
  register: Register
  bucketPath: string
  /** uploadToSignedUrl takes (path, token, file) -- the full signed URL is
      never needed on the client, so it is deliberately not returned. */
  token: string
}

export type BeginResult =
  | { ok: true; targets: SignedTarget[] }
  | { ok: false; message: string }

export interface DraftInput {
  slug: string
  title: string
  caption: string | null
  description: string | null
  altText: string | null
  collectionId: string | null
  /**
   * The EXACT bucketPath values beginIngest signed and returned. Never re-derive
   * these from the filename: beginIngest builds the path from the MIME type
   * (extensionFor), so `Evil Lies.jpeg` is signed as `colour.jpg` and
   * `x.tiff` as `silver.tif`. Deriving from the filename here would download a
   * path that was never written, and TIFF is the whole reason server-side
   * measurement exists.
   */
  colourPath: string
  silverPath: string | null
}

export type DraftResult =
  | { ok: true; photoId: string; widthPx: number; heightPx: number; aspectRatio: number }
  | { ok: false; message: string }

export type StepResult = { ok: true } | { ok: false; message: string }

export type FinishResult =
  | { ok: true; published: boolean; slug: string }
  | { ok: false; message: string; missing?: string[] }

export type DeleteResult = { ok: true } | { ok: false; message: string }
