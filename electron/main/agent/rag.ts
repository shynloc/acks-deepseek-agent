// Relevance selection for the RAG context block.
// Kept free of db / embedding / electron imports so it can be unit-tested directly.

export const RAG_FLOOR   = 0.50  // absolute minimum cosine similarity
export const RAG_GAP_MIN = 0.08  // score drop that counts as a real relevance boundary
export const RAG_MAX     = 3     // hard cap on injected notes

export interface SelectOptions {
  floor?:  number
  gapMin?: number
  max?:    number
}

/**
 * Rank scored rows, drop everything below the floor, then cut at the first
 * significant drop in relevance. The gap check runs over the already-filtered
 * list, so a floor rejection cannot create an artificial gap.
 */
export function selectRelevantNotes<T extends { score: number }>(
  rows: T[],
  opts: SelectOptions = {}
): T[] {
  const floor  = opts.floor  ?? RAG_FLOOR
  const gapMin = opts.gapMin ?? RAG_GAP_MIN
  const max    = opts.max    ?? RAG_MAX

  const scored = rows
    .filter(r => r.score >= floor)
    .sort((a, b) => b.score - a.score)

  let cutoff = scored.length
  for (let i = 0; i < scored.length - 1; i++) {
    if (scored[i].score - scored[i + 1].score >= gapMin) { cutoff = i + 1; break }
  }

  return scored.slice(0, cutoff).slice(0, max)
}
