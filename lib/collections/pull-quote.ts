/**
 * The one line the home hero shows under the collection name, and the same line
 * the admin home-feature preview shows. Shared so the two can never drift.
 * dek wins; else the first sentence of the literature (if short); else a
 * truncation; else nothing.
 */
export function pullQuote(dek: string | null, literature: string | null): string {
  if (dek) return dek
  if (!literature) return ''
  const trimmed = literature.trim()
  if (!trimmed) return ''
  const sentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0]
  if (sentence && sentence.length <= 200) return sentence
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
}
