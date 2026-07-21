/**
 * ONE-TIME legacy catalogue import. Not part of the app build.
 *
 * Run (dry, default):
 *   node --import ./scripts/neutralize-server-only.mjs --import tsx \
 *     scripts/bulk-import.mts --source "C:/Users/Shott/Photography-main/public/images"
 * Run (for real): add --write
 *
 * Needs .env.local for the service key: prefix with `node --env-file=.env.local ...`
 * or export the vars first.
 *
 * Reuses lib/ingest/* — the same core the admin runs, so derivatives are
 * byte-identical. Imports as DRAFTS (legacy data has no alt; Postgres forbids
 * publishing without it). Skips slugs already in the DB. Idempotent.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { planImports, type SourceFile, type ImportDecision } from '@/lib/import/plan'
import { measure, encodeLadder } from '@/lib/ingest/process'
import { originalKey, ORIGINALS_BUCKET, DERIVATIVES_BUCKET } from '@/lib/ingest/keys'
import { expectedObjects } from '@/lib/ingest/plan'
import { validateUpload, validateDimensions, extensionFor } from '@/lib/ingest/validate'
import { supabaseAdmin } from '@/lib/supabase/admin'

// The legacy catalogue is all JPG. If that ever changes, derive per file instead.
const JPEG = 'image/jpeg'

const args = process.argv.slice(2)
const write = args.includes('--write')
const sourceRoot = args[args.indexOf('--source') + 1]
if (!sourceRoot) throw new Error('--source <images dir> is required')

const printsDir = join(sourceRoot, 'prints')
const bwDir = join(printsDir, 'bw')

function collectFiles(): SourceFile[] {
  return readdirSync(printsDir)
    .filter((f) => extname(f).toLowerCase() === '.jpg')
    .map((f) => {
      const colourPath = join(printsDir, f)
      const silverPath = existsSync(join(bwDir, f)) ? join(bwDir, f) : null
      return { basename: basename(f, extname(f)), colourPath, silverPath }
    })
}

async function existingSlugs(): Promise<Set<string>> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('photos').select('slug')
  if (error) throw new Error(`could not read photos: ${error.message}`)
  return new Set((data ?? []).map((r: { slug: string }) => r.slug))
}

async function importOne(d: ImportDecision): Promise<void> {
  const db = supabaseAdmin()
  const colour = readFileSync(d.colourPath)
  const upCheck = validateUpload({ mime: JPEG, bytes: colour.length })
  if (!upCheck.ok) throw new Error(`${d.slug}: ${upCheck.message}`)

  const measured = await measure(colour)
  const dimCheck = validateDimensions(measured.widthPx)
  if (!dimCheck.ok) throw new Error(`${d.slug}: ${dimCheck.message}`)

  // Supabase RETURNS errors, it does not throw them — main's try/catch would
  // miss them, printing "created" over a broken row. Check and throw on every one.
  async function put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await db.storage.from(bucket).upload(key, body, { contentType, upsert: true })
    if (error) throw new Error(`upload ${key}: ${error.message}`)
  }

  const colourKey = originalKey(d.slug, 'colour', extensionFor(JPEG))
  await put(ORIGINALS_BUCKET, colourKey, colour, JPEG)

  let silverKey: string | null = null
  if (d.hasSilver && d.silverPath) {
    const silver = readFileSync(d.silverPath)
    silverKey = originalKey(d.slug, 'silver', extensionFor(JPEG))
    await put(ORIGINALS_BUCKET, silverKey, silver, JPEG)
  }

  for (const register of d.hasSilver ? (['colour', 'silver'] as const) : (['colour'] as const)) {
    const src = register === 'colour' ? colour : readFileSync(d.silverPath!)
    const objects = await encodeLadder(src, d.slug, register)
    for (const o of objects) await put(DERIVATIVES_BUCKET, o.key, o.body, o.contentType)
  }

  // Verify the manifest before marking ready (what finishIngest does).
  const expected = expectedObjects(d.slug, d.hasSilver)
  const present = new Set<string>()
  for (const register of d.hasSilver ? (['colour', 'silver'] as const) : (['colour'] as const)) {
    const { data } = await db.storage.from(DERIVATIVES_BUCKET).list(`${d.slug}/${register}`)
    for (const e of data ?? []) present.add(`${d.slug}/${register}/${e.name}`)
  }
  const ready = expected.every((k) => present.has(k))

  const { error: insErr } = await db.from('photos').insert({
    slug: d.slug,
    title: d.title,
    caption: null,
    description: null,
    alt_text: null,
    aspect_ratio: measured.aspectRatio,
    width_px: measured.widthPx,
    height_px: measured.heightPx,
    aura: measured.aura,
    published: false,
    derivatives_ready: ready,
    has_bw_variant: d.hasSilver,
    original_key: colourKey,
    original_bw_key: silverKey,
  })
  if (insErr) throw new Error(`insert row: ${insErr.message}`)
}

async function main() {
  const files = collectFiles()
  const plan = planImports(files, await existingSlugs())
  const creates = plan.filter((p) => p.action === 'create')
  const skips = plan.filter((p) => p.action === 'skip')

  console.log(`${files.length} source files · ${creates.length} create · ${skips.length} skip`)
  for (const p of plan) console.log(`  ${p.action.padEnd(6)} ${p.slug}${p.reason ? ` (${p.reason})` : ''}${p.hasSilver ? ' [+silver]' : ''}`)

  if (!write) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to perform the import.')
    return
  }

  for (const d of creates) {
    try {
      await importOne(d)
      console.log(`  created ${d.slug}`)
    } catch (err) {
      console.error(`  FAILED ${d.slug}: ${(err as Error).message}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
