import type { ARQuiver, ARArrow, Quiver } from '../types/mathTypes'
import { generateIndecomposables } from './typeAIndecomposables'
import { moduleId } from './utils'

// Build a boolean edge-direction array from the quiver arrows.
// dirs[k] = true means edge k goes k+1 → k+2 (forward/rightward).
function edgeDirs(quiver: Quiver): boolean[] {
  return Array.from({ length: quiver.n - 1 }, (_, k) =>
    quiver.arrows.some(a => a.source === k + 1 && a.target === k + 2),
  )
}

// P(v) = M(left, right):  follow outgoing arrows from v to find reachable interval.
function projectiveRange(v: number, dirs: boolean[]): [number, number] {
  let left = v, right = v
  for (let k = v - 1; k < dirs.length; k++) {     // going right
    if (dirs[k]) right = k + 2; else break
  }
  for (let k = v - 2; k >= 0; k--) {              // going left (edge backward = source > target)
    if (!dirs[k]) left = k + 1; else break
  }
  return [left, right]
}

// I(v) = M(left, right):  find all vertices that can reach v.
function injectiveRange(v: number, dirs: boolean[]): [number, number] {
  let left = v, right = v
  for (let k = v - 2; k >= 0; k--) {              // going left (edge forward reaches v)
    if (dirs[k]) left = k + 1; else break
  }
  for (let k = v - 1; k < dirs.length; k++) {     // going right (edge backward reaches v)
    if (!dirs[k]) right = k + 2; else break
  }
  return [left, right]
}

// AR arrows are fixed regardless of orientation (per LEARNINGS.md).
export function computeARQuiver(quiver: Quiver): ARQuiver {
  const { n } = quiver
  const nodes = generateIndecomposables(n)
  const arrows: ARArrow[] = []

  for (const { i: a, j: b } of nodes) {
    if (a > 1) arrows.push({ sourceId: moduleId(a, b), targetId: moduleId(a - 1, b) })
    if (b > a) arrows.push({ sourceId: moduleId(a, b), targetId: moduleId(a, b - 1) })
  }

  return { nodes, arrows }
}

export function projectiveAt(v: number, quiver: Quiver): string {
  const dirs = edgeDirs(quiver)
  const [l, r] = projectiveRange(v, dirs)
  return moduleId(l, r)
}

export function injectiveAt(v: number, quiver: Quiver): string {
  const dirs = edgeDirs(quiver)
  const [l, r] = injectiveRange(v, dirs)
  return moduleId(l, r)
}

// Works for any orientation including custom.
export function isProjective(a: number, b: number, quiver: Quiver): boolean {
  const dirs = edgeDirs(quiver)
  for (let v = 1; v <= quiver.n; v++) {
    const [l, r] = projectiveRange(v, dirs)
    if (l === a && r === b) return true
  }
  return false
}

export function isInjective(a: number, b: number, quiver: Quiver): boolean {
  const dirs = edgeDirs(quiver)
  for (let v = 1; v <= quiver.n; v++) {
    const [l, r] = injectiveRange(v, dirs)
    if (l === a && r === b) return true
  }
  return false
}

// TODO: layout to be implemented
export function computeARLayout(
  _arQuiver: ARQuiver,
  _quiver: Quiver,
): Map<string, { x: number; y: number }> {
  return new Map()
}

// Flipped-diamond layout: projectives P(i)=M(i,n) form the LEFT border of the diamond.
// Arrows M(a,b)→M(a-1,b) go diagonal ↗ (right+up) and M(a,b)→M(a,b-1) go diagonal ↘
// (right+down), producing the real mesh pattern from the literature.
//
// x = (2n - a - b) · dx   → largest for simples (right), 0 for P(n)=M(n,n) (left)
// y = (n-1-(b-a))  · dy   → 0 at top (widest intervals), n-1 at bottom (simples)
export function arNodePosition(
  a: number,
  b: number,
  n: number,
  spacingX = 90,
  spacingY = 75,
): { x: number; y: number } {
  return {
    x: (2 * n - a - b) * spacingX,
    y: (n - 1 - (b - a)) * spacingY,
  }
}
