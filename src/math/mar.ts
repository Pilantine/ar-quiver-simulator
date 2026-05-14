import type { Module } from '../types/mathTypes'
import type { SES } from './exactSequences'

function hasTwoMiddleSES(a: Module, b: Module, sesList: SES[]): boolean {
  return sesList.some(s =>
    s.middle.length === 2 && (
      (s.left.id === a.id && s.right.id === b.id) ||
      (s.left.id === b.id && s.right.id === a.id)
    )
  )
}

export function computeMAR(
  modules: Module[],
  sesList: SES[],
  arSES: SES[],   // pre-filtered AR sequences
  n: number,
): Module[][] {
  // Seed: right terms of AR SES with exactly 1 middle term
  const arOneMid = arSES.filter(s => s.middle.length === 1)
  const seedIds = new Set(arOneMid.map(s => s.right.id))
  const seed = modules.filter(m => seedIds.has(m.id))

  // Each MAR has exactly 2n-1 summands total
  const kExtra = 2 * n - 1 - seed.length
  const remaining = modules.filter(m => !seedIds.has(m.id))

  const results: Module[][] = []

  function backtrack(start: number, current: Module[]) {
    if (current.length === kExtra) {
      results.push([...seed, ...current])
      return
    }
    for (let i = start; i < remaining.length; i++) {
      const m = remaining[i]
      // Only check pairs within the extra subset (m vs already-chosen current)
      const invalid = current.some(x => hasTwoMiddleSES(x, m, sesList))
      if (!invalid) {
        current.push(m)
        backtrack(i + 1, current)
        current.pop()
      }
    }
  }

  backtrack(0, [])

  return results
}
