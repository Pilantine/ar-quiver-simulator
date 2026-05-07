import type { Quiver, Arrow, Orientation } from '../types/mathTypes'

export function buildQuiver(n: number, orientation: Orientation, customArrows?: Arrow[]): Quiver {
  const vertices = Array.from({ length: n }, (_, k) => k + 1)

  let arrows: Arrow[]

  if (orientation === 'linear') {
    // 1 → 2 → 3 → ... → n
    arrows = vertices.slice(0, -1).map(v => ({ source: v, target: v + 1 }))
  } else if (orientation === 'opposite') {
    // n → ... → 2 → 1
    arrows = vertices.slice(0, -1).map(v => ({ source: v + 1, target: v }))
  } else {
    // custom: use provided arrows, fallback to linear
    arrows = customArrows ?? vertices.slice(0, -1).map(v => ({ source: v, target: v + 1 }))
  }

  return { n, vertices, arrows, orientation, quiverType: 'A' }
}
