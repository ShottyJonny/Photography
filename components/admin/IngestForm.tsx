'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deriveSlug } from '@/lib/ingest/slug'
import { priceRangeLabel } from '@/lib/format/price'
import { supabaseBrowser } from '@/lib/supabase/client'
import { beginIngest, createPhotoDraft, generateRegister, finishIngest } from '@/lib/ingest/actions'
import { ORIGINALS_BUCKET } from '@/lib/ingest/keys'
import type { AdminCollection } from '@/lib/data/photos-admin'
import { Dropzone } from '@/components/admin/Dropzone'
import { CropPreview } from '@/components/admin/CropPreview'
import { IngestProgress, type StepKey, type StepState } from '@/components/admin/IngestProgress'

interface Measured {
  widthPx: number
  heightPx: number
  aspectRatio: number
}

export function IngestForm({ collections }: { collections: AdminCollection[] }) {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [caption, setCaption] = useState('')
  const [description, setDescription] = useState('')
  const [altText, setAltText] = useState('')
  const [collectionId, setCollectionId] = useState('')

  const [colourFile, setColourFile] = useState<File | null>(null)
  const [colourUrl, setColourUrl] = useState<string | null>(null)
  const [silverOn, setSilverOn] = useState(false)
  const [silverFile, setSilverFile] = useState<File | null>(null)

  const [measured, setMeasured] = useState<Measured | null>(null)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<{ key: StepKey; state: StepState }[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const ladder = useMemo(() => priceRangeLabel(), [])

  function chooseColour(file: File | null) {
    setColourFile(file)
    setMeasured(null)
    // Release the previous blob: URL -- replacing a 40MB file repeatedly
    // otherwise pins each one in memory for the life of the document.
    if (colourUrl) URL.revokeObjectURL(colourUrl)
    if (!file) {
      setColourUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setColourUrl(url)
    // Browser-side measurement is a COURTESY so the crop guides appear at once.
    // TIFF cannot be decoded here; the server measures on save and is always
    // authoritative. Nothing is claimed until one of them has really measured.
    const probe = new Image()
    probe.onload = () =>
      setMeasured({
        widthPx: probe.naturalWidth,
        heightPx: probe.naturalHeight,
        aspectRatio: probe.naturalWidth / probe.naturalHeight,
      })
    probe.src = url
  }

  function setStep(key: StepKey, state: StepState) {
    setSteps((prev) => (prev ?? []).map((s) => (s.key === key ? { ...s, state } : s)))
  }

  function fail(text: string, key: StepKey) {
    setStep(key, 'failed')
    setMessage(text)
    setFailed(true)
    setBusy(false)
  }

  async function save(publish: boolean) {
    if (!colourFile) return
    const useSilver = silverOn && silverFile !== null

    setBusy(true)
    setFailed(false)
    setMessage(null)
    setSteps([
      { key: 'upload', state: 'active' },
      { key: 'colour', state: 'pending' },
      ...(useSilver ? ([{ key: 'silver' as const, state: 'pending' as const }]) : []),
      { key: 'finish', state: 'pending' },
    ])

    const begun = await beginIngest({
      slug,
      title,
      colour: { mime: colourFile.type, bytes: colourFile.size },
      ...(useSilver ? { silver: { mime: silverFile!.type, bytes: silverFile!.size } } : {}),
    })
    if (!begun.ok) return fail(begun.message, 'upload')

    const storage = supabaseBrowser().storage.from(ORIGINALS_BUCKET)
    for (const target of begun.targets) {
      const file = target.register === 'colour' ? colourFile : silverFile!
      // uploadToSignedUrl, NOT a hand-rolled fetch: it wraps a Blob body in
      // FormData with cacheControl and PUTs to /object/upload/sign/<path>?token=.
      const { error } = await storage.uploadToSignedUrl(target.bucketPath, target.token, file)
      if (error) return fail('The upload didn’t finish. Nothing was saved.', 'upload')
    }
    setStep('upload', 'done')

    setStep('colour', 'active')
    const draft = await createPhotoDraft({
      slug,
      title,
      caption: caption.trim() || null,
      description: description.trim() || null,
      altText: altText.trim() || null,
      collectionId: collectionId || null,
      // Verbatim from beginIngest. Deriving these from the filename would sign
      // `colour.jpg` (from the MIME) and then read back `colour.jpeg`.
      colourPath: begun.targets.find((t) => t.register === 'colour')!.bucketPath,
      silverPath: begun.targets.find((t) => t.register === 'silver')?.bucketPath ?? null,
    })
    if (!draft.ok) return fail(draft.message, 'colour')
    setMeasured({ widthPx: draft.widthPx, heightPx: draft.heightPx, aspectRatio: draft.aspectRatio })

    const colourStep = await generateRegister({ photoId: draft.photoId, register: 'colour' })
    if (!colourStep.ok) return fail(`${colourStep.message} It’s saved as a draft — retry from Photographs.`, 'colour')
    setStep('colour', 'done')

    if (useSilver) {
      setStep('silver', 'active')
      const silverStep = await generateRegister({ photoId: draft.photoId, register: 'silver' })
      if (!silverStep.ok) return fail(`${silverStep.message} It’s saved as a draft — retry from Photographs.`, 'silver')
      setStep('silver', 'done')
    }

    setStep('finish', 'active')
    const finished = await finishIngest({ photoId: draft.photoId, publish })
    if (!finished.ok) return fail(`${finished.message} It’s saved as a draft — retry from Photographs.`, 'finish')
    setStep('finish', 'done')

    router.push('/admin/photographs')
    router.refresh()
  }

  const canSave = colourFile !== null && slug !== '' && title.trim() !== '' && !busy
  const canPublish = canSave && altText.trim() !== ''

  return (
    <div className="admin-ingest">
      <div>
        <Dropzone
          label="The colour original"
          hint="Drag it in, or choose a file. JPEG, PNG, TIFF or WebP, at least 1800px wide."
          file={colourFile}
          hasPreview={colourUrl !== null}
          onFile={chooseColour}
          disabled={busy}
        >
          {colourUrl ? <CropPreview src={colourUrl} aspectRatio={measured?.aspectRatio ?? null} /> : null}
        </Dropzone>

        <div className="admin-toggles" style={{ marginTop: 16 }}>
          <div className="admin-toggle">
            <span className="admin-toggle-copy">
              <strong>Offer a silver (B&amp;W) variant</strong>
              <span>Your own conversion, uploaded separately. Nothing is desaturated for you.</span>
            </span>
            <button
              id="ingest-silver-toggle"
              type="button"
              role="switch"
              aria-checked={silverOn}
              aria-label="Offer a silver (B&W) variant"
              className="admin-switch"
              disabled={busy}
              onClick={() => setSilverOn((on) => !on)}
            />
          </div>
        </div>

        {silverOn ? (
          <div style={{ marginTop: 16 }}>
            <Dropzone
              label="The silver original"
              hint="Your hand-converted black-and-white file."
              file={silverFile}
              hasPreview={false}
              onFile={setSilverFile}
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="admin-detected">
          <p className="admin-detected-label">Detected</p>
          {colourFile ? (
            <>
              <p className="admin-detected-line">{colourFile.name}</p>
              <p className="admin-detected-sub">
                {(colourFile.size / 1_048_576).toFixed(1)} MB
                {measured ? ` · ${measured.widthPx} × ${measured.heightPx}` : ' · dimensions measured on save'}
              </p>
            </>
          ) : (
            <p className="admin-detected-sub">Nothing chosen yet.</p>
          )}
        </div>

        <p className="admin-ingest-note">
          On save: the original is stored privately · six widths in AVIF and WebP are generated once
          per register · nothing is published until every one of them exists.
        </p>
      </div>

      <div className="admin-form">
        <div className="admin-formfield">
          <label htmlFor="ingest-title">Title</label>
          <input
            id="ingest-title" className="admin-input is-title" value={title} disabled={busy}
            onChange={(e) => {
              setTitle(e.target.value)
              if (!slugTouched) setSlug(deriveSlug(e.target.value))
            }}
          />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-slug">
            Web address<span className="admin-formhint">where the print lives</span>
          </label>
          {/*
            A LENIENT transform while typing, the full deriveSlug on blur.
            Running deriveSlug on every keystroke trims trailing separators, so
            typing "evil" then "-" yields "evil" again and a multi-word slug can
            never be typed by hand.
          */}
          <input
            id="ingest-slug" className="admin-input is-slug" value={slug} disabled={busy}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'))
            }}
            onBlur={(e) => setSlug(deriveSlug(e.target.value))}
          />
          <p className="admin-slugnote">
            /prints/{slug || '…'} — this can’t be changed after saving, because the stored files are
            named after it.
          </p>
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-caption">
            Caption<span className="admin-formhint">short line on the card</span>
          </label>
          <input id="ingest-caption" className="admin-input is-prose" value={caption} disabled={busy}
            onChange={(e) => setCaption(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-description">
            Description<span className="admin-formhint">the print’s page</span>
          </label>
          <textarea id="ingest-description" className="admin-input is-prose-long" value={description}
            disabled={busy} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-alt">
            Alt text
            <span className="admin-formhint is-a11y">describes the image — accessibility</span>
          </label>
          <textarea id="ingest-alt" className="admin-input is-alt" value={altText} disabled={busy}
            onChange={(e) => setAltText(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-collection">Collection</label>
          <select id="ingest-collection" className="admin-select" value={collectionId} disabled={busy}
            onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">{collections.length ? 'None' : 'No collections yet'}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="admin-formfield">
          <p className="admin-detected-label" style={{ marginBottom: 9 }}>Sizes and price</p>
          <p className="admin-ladder">
            Every photograph is offered in all seven sizes, {ladder}, priced by size.
          </p>
        </div>

        {/*
          NO "Publish now" toggle (D25). The prototype carries both the toggle
          AND the two buttons, which is a redundancy it never resolved. The two
          buttons already express the choice; a toggle beside them either does
          nothing (a dead control -- product.md §1) or silently contradicts
          whichever button is pressed.
        */}
        <p className="admin-slugnote">
          Saving as a draft keeps it hidden from everyone. You can publish it later from Photographs.
        </p>

        <div className="admin-actions">
          <button type="button" className="admin-btn is-wide" disabled={!canPublish}
            onClick={() => save(true)}>
            Save &amp; publish
          </button>
          <button type="button" className="admin-btn2" disabled={!canSave} onClick={() => save(false)}>
            Save as draft
          </button>
        </div>

        {!canPublish && canSave ? (
          <p className="admin-slugnote">Alt text is required before publishing.</p>
        ) : null}

        {steps ? <IngestProgress steps={steps} message={message} failed={failed} /> : null}
      </div>
    </div>
  )
}
