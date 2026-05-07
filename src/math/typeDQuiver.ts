import type { Quiver, Arrow } from '../types/mathTypes'

// D_n quiver: vertices 1..n, fork at vertex 3 (vertices 1 and 2 both connect to 3),
// then linear chain 3-4-...-n.
// Default orientation: 1→3, 2→3, 3→4, ..., (n-1)→n  (subspace orientation)
export function buildDnQuiver(n: number, customArrows?: Arrow[]): Quiver {
  if (n < 4) throw new Error('Type D requires n ≥ 4')
  const vertices = Array.from({ length: n }, (_, k) => k + 1)
  const arrows: Arrow[] = customArrows ?? [
    { source: 1, target: 3 },
    { source: 2, target: 3 },
    ...Array.from({ length: n - 3 }, (_, k) => ({ source: k + 3, target: k + 4 })),
  ]
  return { n, vertices, arrows, orientation: customArrows ? 'custom' : 'linear', quiverType: 'D' }
}
