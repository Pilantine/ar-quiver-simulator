import type { Module, DModule, DSES, ARArrow, Arrow } from '../types/mathTypes'

export interface SES {
  left: Module
  middle: [Module] | [Module, Module]
  right: Module
}

function dimVec(m: Module, n: number): number[] {
  const v = new Array(n).fill(0)
  for (let k = m.i; k <= m.j; k++) v[k - 1]++
  return v
}

function addVecs(a: number[], b: number[]): number[] {
  return a.map((x, i) => x + b[i])
}

function vecsEqual(a: number[], b: number[]): boolean {
  return a.every((x, i) => x === b[i])
}

function eulerForm(x: number[], y: number[], arrows: Arrow[]): number {
  let s = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  for (const a of arrows) s -= x[a.source - 1] * y[a.target - 1]
  return s
}

function computeHom(
  aId: string, bId: string,
  modById: Map<string, DModule>,
  qArrows: Arrow[],
  memo: Map<string, number>,
): number {
  const key = `${aId}|${bId}`
  if (memo.has(key)) return memo.get(key)!
  const A = modById.get(aId)!
  const B = modById.get(bId)!
  let result: number
  if (A.projVertex !== undefined) {
    result = B.dimVec[A.projVertex - 1]
  } else {
    const tauA = A.generatedBy!.srcId
    result = eulerForm(A.dimVec, B.dimVec, qArrows) + computeHom(bId, tauA, modById, qArrows, memo)
  }
  memo.set(key, result)
  return result
}

export function computeDSES(modules: DModule[], xPos: Map<string, number>, qArrows: Arrow[]): DSES[] {
  const results: DSES[] = []
  const modById = new Map(modules.map(m => [m.id, m]))
  const memo = new Map<string, number>()

  const hom = (aId: string, bId: string) => computeHom(aId, bId, modById, qArrows, memo)

  // Ext¹(D, A) ≠ 0  ⟺  D non-projective AND Hom(A, τD) > 0
  const extCheck = (leftId: string, rightId: string): boolean => {
    const right = modById.get(rightId)!
    if (!right.generatedBy) return false
    return hom(leftId, right.generatedBy.srcId) > 0
  }

  // All middle terms must have nonzero maps from left and to right
  const middleCheck = (leftId: string, midIds: string[], rightId: string): boolean =>
    midIds.every(mId => hom(leftId, mId) > 0 && hom(mId, rightId) > 0)


  for (const left of modules) {
    const lx = xPos.get(left.id)
    if (lx === undefined) continue
    for (const right of modules) {
      if (left.id === right.id) continue
      const rx = xPos.get(right.id)
      if (rx === undefined) continue
      if (rx <= lx) continue
      if (!extCheck(left.id, right.id)) continue

      const target = left.dimVec.map((v, i) => v + right.dimVec[i])
      const candidates = modules.filter(m => {
        const mx = xPos.get(m.id)
        return mx !== undefined && mx > lx && mx < rx
      })

      for (const b of candidates) {
        if (vecsEqual(b.dimVec, target) && middleCheck(left.id, [b.id], right.id))
          results.push({ left, middle: [b], right })
      }

      for (let i = 0; i < candidates.length; i++) {
        for (let j = i; j < candidates.length; j++) {
          const b = candidates[i], c = candidates[j]
          if (vecsEqual(b.dimVec.map((v, k) => v + c.dimVec[k]), target) && middleCheck(left.id, [b.id, c.id], right.id))
            results.push({ left, middle: [b, c], right })
        }
      }

      for (let i = 0; i < candidates.length; i++) {
        for (let j = i; j < candidates.length; j++) {
          for (let k = j; k < candidates.length; k++) {
            const b = candidates[i], c = candidates[j], d = candidates[k]
            if (vecsEqual(b.dimVec.map((v, idx) => v + c.dimVec[idx] + d.dimVec[idx]), target) && middleCheck(left.id, [b.id, c.id, d.id], right.id))
              results.push({ left, middle: [b, c, d], right })
          }
        }
      }
    }
  }

  return results
}

export function computeDExactStructure(
  sesList: DSES[],
  selectedARSES: DSES[],
  xPos: Map<string, number>,
  arArrows: ARArrow[],
  spacingX = 90,
): DSES[] {
  const sesKey = (s: DSES) => `${s.left.id}|${s.right.id}`
  const sesMap = new Map<string, DSES>()
  for (const s of sesList) sesMap.set(sesKey(s), s)

  // Build incoming/outgoing AR arrow maps
  const incoming = new Map<string, string[]>()  // nodeId → [sourceIds]
  const outgoing = new Map<string, string[]>()  // nodeId → [targetIds]
  for (const a of arArrows) {
    if (!incoming.has(a.targetId)) incoming.set(a.targetId, [])
    incoming.get(a.targetId)!.push(a.sourceId)
    if (!outgoing.has(a.sourceId)) outgoing.set(a.sourceId, [])
    outgoing.get(a.sourceId)!.push(a.targetId)
  }

  // Rank of a SES = round(xDist / spacingX)
  const rank = (s: DSES): number => {
    const lx = xPos.get(s.left.id) ?? 0
    const rx = xPos.get(s.right.id) ?? 0
    return Math.round((rx - lx) / spacingX)
  }

  // Group SES by rank
  const byRank = new Map<number, DSES[]>()
  for (const s of sesList) {
    const r = rank(s)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(s)
  }

  const inStructure = new Set<string>(selectedARSES.map(sesKey))

  const maxRank = Math.max(...[...byRank.keys()])
  for (let r = 3; r <= maxRank; r++) {
    for (const s of byRank.get(r) ?? []) {
      const pullbacks: DSES[] = (incoming.get(s.right.id) ?? [])
        .map(srcId => sesMap.get(`${s.left.id}|${srcId}`))
        .filter((x): x is DSES => x !== undefined)

      const pushouts: DSES[] = (outgoing.get(s.left.id) ?? [])
        .map(tgtId => sesMap.get(`${tgtId}|${s.right.id}`))
        .filter((x): x is DSES => x !== undefined)

      const deps = [...pullbacks, ...pushouts]
      if (deps.every(d => inStructure.has(sesKey(d)))) {
        inStructure.add(sesKey(s))
      }
    }
  }

  return sesList.filter(s => inStructure.has(sesKey(s)))
}

// Middle term [p,q] must share an endpoint with the given term [i,j]
function sharesEndpoint(mid: Module, term: Module): boolean {
  return mid.i === term.i || mid.j === term.j
}

interface SESOptions {
  xPositions?: Map<string, number>
}

export function computeSES(modules: Module[], n: number, opts?: SESOptions): SES[] {
  const results: SES[] = []
  const dims = new Map(modules.map(m => [m.id, dimVec(m, n)]))
  const xPos = opts?.xPositions

  for (const left of modules) {
    const lx = xPos?.get(left.id)
    for (const right of modules) {
      if (left.id === right.id) continue
      const rx = xPos?.get(right.id)
      // Constraint 1: left must be visually left of right
      if (lx !== undefined && rx !== undefined && rx <= lx) continue

      const target = addVecs(dims.get(left.id)!, dims.get(right.id)!)

      // Case a: single middle term
      for (const mid of modules) {
        if (mid.id === left.id || mid.id === right.id) continue
        if (!vecsEqual(dims.get(mid.id)!, target)) continue
        // Constraint 2: middle x between left and right
        if (xPos) {
          const mx = xPos.get(mid.id)
          if (lx !== undefined && rx !== undefined && mx !== undefined && !(lx < mx && mx < rx)) continue
        }
        // Constraint 3: middle shares endpoint with left AND with right
        if (xPos && (!sharesEndpoint(mid, left) || !sharesEndpoint(mid, right))) continue
        results.push({ left, middle: [mid], right })
      }

      // Case b: two middle terms
      for (let i = 0; i < modules.length; i++) {
        for (let j = i; j < modules.length; j++) {
          const b = modules[i], c = modules[j]
          if (b.id === left.id && c.id === right.id) continue
          if (b.id === right.id && c.id === left.id) continue
          const sum = addVecs(dims.get(b.id)!, dims.get(c.id)!)
          if (!vecsEqual(sum, target)) continue
          // Constraint 2: both middles x between left and right
          if (xPos) {
            const bx = xPos.get(b.id), cx = xPos.get(c.id)
            if (lx !== undefined && rx !== undefined) {
              if (bx !== undefined && !(lx < bx && bx < rx)) continue
              if (cx !== undefined && !(lx < cx && cx < rx)) continue
            }
          }
          // Constraint 3: each middle shares endpoint with left AND with right
          if (xPos && (
            !sharesEndpoint(b, left) || !sharesEndpoint(b, right) ||
            !sharesEndpoint(c, left) || !sharesEndpoint(c, right)
          )) continue
          results.push({ left, middle: [b, c], right })
        }
      }
    }
  }

  return results
}
