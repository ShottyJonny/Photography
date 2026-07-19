/**
 * THROWAWAY dev fixture — slice 5 replaces this with real ingest.
 * Uses the Supabase SERVICE key. Must never be imported by app/ lib/ or components/.
 *
 * Run (with env vars set, e.g. from .env.local):
 *   node scripts/seed-storefront.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_ASSETS = join(__dirname, 'seed-assets')

const WIDTHS = [160, 400, 600, 960, 1200, 1800]
const FORMATS = ['avif', 'webp']
const REGISTERS = ['colour', 'silver']

function fail(message) {
  console.error(message)
  process.exit(1)
}

function toSlug(filename) {
  const base = filename.replace(/\.[^.]+$/i, '')
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTitle(filename) {
  const base = filename.replace(/\.[^.]+$/i, '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

async function loadSeedImages() {
  let entries
  try {
    entries = await readdir(SEED_ASSETS)
  } catch {
    entries = []
  }

  const files = entries.filter((name) => name.toLowerCase().endsWith('.jpg')).slice(0, 3)
  if (files.length === 0) {
    fail('No images in scripts/seed-assets/ — copy 3 .jpg from Photography-main/public/images/prints')
  }
  return files
}

async function encodeDerivative(sourceBuffer, width, format, grayscale) {
  let pipeline = sharp(sourceBuffer).resize(width, null, { withoutEnlargement: true })
  if (grayscale) {
    pipeline = pipeline.grayscale()
  }

  if (format === 'avif') {
    return { buffer: await pipeline.avif().toBuffer(), contentType: 'image/avif' }
  }
  return { buffer: await pipeline.webp().toBuffer(), contentType: 'image/webp' }
}

async function uploadDerivatives(db, slug, sourceBuffer, hasBwVariant) {
  let uploaded = 0

  for (const register of REGISTERS) {
    if (register === 'silver' && !hasBwVariant) continue

    for (const width of WIDTHS) {
      for (const format of FORMATS) {
        const { buffer, contentType } = await encodeDerivative(
          sourceBuffer,
          width,
          format,
          register === 'silver',
        )
        const key = `${slug}/${register}/${width}.${format}`
        const { error } = await db.storage.from('derivatives').upload(key, buffer, {
          upsert: true,
          contentType,
        })
        if (error) {
          throw new Error(`Storage upload failed for ${key}: ${error.message}`)
        }
        uploaded += 1
      }
    }
  }

  return uploaded
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    fail(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Export them from .env.local before running.',
    )
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const seedFiles = await loadSeedImages()
  const photoIds = []
  let totalUploaded = 0

  for (let index = 0; index < seedFiles.length; index += 1) {
    const filename = seedFiles[index]
    const slug = toSlug(filename)
    const title = toTitle(filename)
    const hasBwVariant = index === 0
    const sourceBuffer = await readFile(join(SEED_ASSETS, filename))
    const metadata = await sharp(sourceBuffer).metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read dimensions for ${filename}`)
    }

    const widthPx = metadata.width
    const heightPx = metadata.height
    const aspectRatio = Math.round((widthPx / heightPx) * 10000) / 10000
    const altText = `Photograph: ${title} (fixture alt text)`

    totalUploaded += await uploadDerivatives(db, slug, sourceBuffer, hasBwVariant)

    const { data: photo, error: photoError } = await db
      .from('photos')
      .upsert(
        {
          slug,
          title,
          alt_text: altText,
          aspect_ratio: aspectRatio,
          width_px: widthPx,
          height_px: heightPx,
          has_bw_variant: hasBwVariant,
          published: true,
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()

    if (photoError) {
      throw new Error(`Photo upsert failed for ${slug}: ${photoError.message}`)
    }

    photoIds.push(photo.id)
  }

  const { data: collection, error: collectionError } = await db
    .from('collections')
    .upsert(
      {
        slug: 'reliquary',
        name: 'Reliquary',
        dek: 'A small cabinet of prints held close.',
        literature:
          'These photographs arrive like objects recovered from a drawer you forgot you owned. ' +
          'They do not explain themselves. They ask only that you look long enough for the surface to give way.',
        featured_on_home: true,
        position: 0,
        cover_photo_id: photoIds[0],
      },
      { onConflict: 'slug' },
    )
    .select('id, slug, featured_on_home')
    .single()

  if (collectionError) {
    throw new Error(`Collection upsert failed: ${collectionError.message}`)
  }

  const { error: joinError } = await db.from('collection_photos').upsert(
    photoIds.map((photoId, position) => ({
      collection_id: collection.id,
      photo_id: photoId,
      position,
    })),
    { onConflict: 'collection_id,photo_id' },
  )

  if (joinError) {
    throw new Error(`collection_photos upsert failed: ${joinError.message}`)
  }

  console.log('SUMMARY')
  console.log(`  Photos upserted: ${photoIds.length}`)
  console.log(`  Derivative objects uploaded: ${totalUploaded}`)
  console.log(`  Collection slug: ${collection.slug}`)
  console.log(`  featured_on_home: ${collection.featured_on_home}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
