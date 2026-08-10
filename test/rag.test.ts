import { describe, it, expect } from 'vitest'
import { selectRelevantNotes, RAG_FLOOR, RAG_MAX } from '../electron/main/agent/rag'

/** Build rows in the shape buildRagContext produces, identified by score. */
function rows(...scores: number[]): { id: string; score: number }[] {
  return scores.map((score, i) => ({ id: `n${i}`, score }))
}

const ids = (rs: { id: string }[]): string[] => rs.map(r => r.id)

describe('selectRelevantNotes', () => {
  describe('floor', () => {
    it('drops everything below the floor', () => {
      expect(selectRelevantNotes(rows(0.9, 0.3, 0.2))).toHaveLength(1)
    })

    it('keeps a score exactly at the floor', () => {
      const out = selectRelevantNotes(rows(RAG_FLOOR))
      expect(out).toHaveLength(1)
    })

    it('returns nothing when every score is below the floor', () => {
      expect(selectRelevantNotes(rows(0.49, 0.4, 0.1))).toEqual([])
    })

    it('returns nothing for an empty input', () => {
      expect(selectRelevantNotes([])).toEqual([])
    })
  })

  describe('ordering', () => {
    it('sorts by score descending regardless of input order', () => {
      const out = selectRelevantNotes(
        [{ id: 'low', score: 0.55 }, { id: 'high', score: 0.95 }, { id: 'mid', score: 0.60 }],
        { gapMin: 1 }   // disable gap cutting so ordering is what's under test
      )
      expect(ids(out)).toEqual(['high', 'mid', 'low'])
    })
  })

  describe('gap detection', () => {
    it('cuts at the first drop of at least gapMin', () => {
      // 0.90 → 0.88 (0.02, keep going) → 0.60 (0.28, cut here)
      const out = selectRelevantNotes(rows(0.90, 0.88, 0.60, 0.58))
      expect(out.map(r => r.score)).toEqual([0.90, 0.88])
    })

    it('keeps everything when no gap reaches gapMin', () => {
      // Tightly clustered scores — the "no discrimination" case
      const out = selectRelevantNotes(rows(0.70, 0.68, 0.66))
      expect(out).toHaveLength(3)
    })

    // Scores are float cosine similarities and gapMin is compared with >=, so a gap
    // constructed as exactly gapMin is not reliably on either side of the boundary
    // (0.80 - 0.08 === 0.7200000000000001). These use literals with an unambiguous gap.
    it('cuts on a gap at the gapMin boundary', () => {
      const out = selectRelevantNotes(rows(0.80, 0.72, 0.60))   // gap 0.08
      expect(out).toHaveLength(1)
    })

    it('does not cut on a gap under gapMin', () => {
      const out = selectRelevantNotes(rows(0.80, 0.75))          // gap 0.05
      expect(out).toHaveLength(2)
    })

    it('isolates a single standout match', () => {
      // One strong hit far above the rest — the case the gap rule exists for
      const out = selectRelevantNotes(rows(0.85, 0.52, 0.51, 0.50))
      expect(out.map(r => r.score)).toEqual([0.85])
    })

    it('measures the gap after the floor filter, so a rejected row cannot create one', () => {
      // Raw sequence 0.62 → 0.49 has a 0.13 gap, but 0.49 is below the floor and
      // is removed first, leaving 0.62 → 0.58 (0.04) which is not a real boundary.
      const out = selectRelevantNotes(rows(0.62, 0.49, 0.58))
      expect(out).toHaveLength(2)
    })
  })

  describe('max cap', () => {
    it(`returns at most ${RAG_MAX} notes`, () => {
      const out = selectRelevantNotes(rows(0.90, 0.89, 0.88, 0.87, 0.86, 0.85))
      expect(out).toHaveLength(RAG_MAX)
    })

    it('applies the cap to the highest scores', () => {
      const out = selectRelevantNotes(rows(0.86, 0.90, 0.88, 0.87))
      expect(out.map(r => r.score)).toEqual([0.90, 0.88, 0.87])
    })

    it('applies the gap cut before the cap', () => {
      // Gap after the 2nd item cuts to 2 — fewer than the cap
      const out = selectRelevantNotes(rows(0.95, 0.94, 0.70, 0.69, 0.68))
      expect(out).toHaveLength(2)
    })
  })

  describe('option overrides', () => {
    it('honours a custom floor', () => {
      expect(selectRelevantNotes(rows(0.55), { floor: 0.6 })).toEqual([])
    })

    it('honours a custom max', () => {
      const out = selectRelevantNotes(rows(0.90, 0.89, 0.88), { max: 1 })
      expect(out).toHaveLength(1)
    })

    it('honours a custom gapMin', () => {
      const out = selectRelevantNotes(rows(0.90, 0.88, 0.86), { gapMin: 0.01 })
      expect(out).toHaveLength(1)
    })
  })

  it('does not mutate the input array', () => {
    const input = rows(0.6, 0.9, 0.7)
    const before = ids(input)
    selectRelevantNotes(input)
    expect(ids(input)).toEqual(before)
  })

  it('preserves the caller row shape', () => {
    const out = selectRelevantNotes([
      { id: 'a', title: 'T', content: 'C', score: 0.9 }
    ])
    expect(out[0]).toMatchObject({ id: 'a', title: 'T', content: 'C' })
  })
})
