/**
 * A slug is a STORAGE PATH SEGMENT, not merely a URL nicety.
 *
 * product.md §3.2 keys both buckets by slug -- originals/<slug>/<register>.<ext>
 * and derivatives/<slug>/<register>/<width>.<fmt> -- so anything that survives
 * this function ends up in an object key. It must therefore never emit `/`,
 * `\`, `.` or whitespace, or a title could escape its own prefix.
 *
 * It is also why the slug is frozen after save: renaming a photo later would
 * orphan every derivative, silently.
 */
export function deriveSlug(title: string): string {
  return title
    .normalize('NFKD')                  // é -> e + combining acute
    .replace(/[\u0300-\u036f]/g, '')  // drop the combining marks
    .replace(/æ/gi, 'ae')               // NFKD does not decompose these ligatures
    .replace(/œ/gi, 'oe')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[''´`]/g, '')             // punctuation removed, not hyphenated
    .replace(/[^a-z0-9]+/g, '-')        // everything else becomes a separator
    .replace(/-+/g, '-')                // collapse runs
    .replace(/^-|-$/g, '')              // trim
}
