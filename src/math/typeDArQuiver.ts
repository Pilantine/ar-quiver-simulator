import type { Quiver, DModule, DARQuiver, ARArrow, NodeType } from '../types/mathTypes'

function dimId(vec: number[]): string { return vec.join('_') }

function computeDimVec(v: number, n: number, qArrows: { source: number; target: number }[]): number[] {
  const vec = new Array(n).fill(0)
  const visited = new Set<number>([v])
  const queue = [v]
  while (queue.length > 0) {
    const curr = queue.shift()!
    vec[curr - 1]++
    for (const a of qArrows) {
      if (a.source === curr && !visited.has(a.target)) { visited.add(a.target); queue.push(a.target) }
    }
  }
  return vec
}

// Compute BFS layers for any module given its dim vector and Q arrows.
// Roots = support vertices with no incoming Q arrows from other support vertices.
function computeLayersFromDimVec(dimVec: number[], qArrows: { source: number; target: number }[]): number[][] {
  const support = new Set(dimVec.map((x, i) => x > 0 ? i + 1 : null).filter((x): x is number => x !== null))
  const roots = [...support].filter(v => !qArrows.some(a => a.target === v && support.has(a.source)))
  const dist = new Map<number, number>()
  const queue: number[] = []
  for (const r of roots) { dist.set(r, 0); queue.push(r) }
  while (queue.length > 0) {
    const curr = queue.shift()!
    for (const a of qArrows) {
      if (a.source === curr && support.has(a.target) && !dist.has(a.target)) {
        dist.set(a.target, dist.get(curr)! + 1); queue.push(a.target)
      }
    }
  }
  const maxDist = dist.size > 0 ? Math.max(...dist.values()) : 0
  return Array.from({ length: maxDist + 1 }, (_, d) =>
    [...dist.entries()]
      .filter(([, dd]) => dd === d)
      .sort(([a], [b]) => a - b)
      .flatMap(([u]) => Array(dimVec[u - 1]).fill(u))
  )
}

export function computeDnARQuiver(quiver: Quiver): DARQuiver {
  const { n, arrows: qArrows } = quiver
  const nodes = new Map<string, DModule>()
  const arArrows: ARArrow[] = []
  const outgoing = new Map<string, string[]>()

  const queue: string[] = []
  const processed = new Set<string>()

  function addArrow(srcId: string, tgtId: string) {
    arArrows.push({ sourceId: srcId, targetId: tgtId })
    if (!outgoing.has(srcId)) outgoing.set(srcId, [])
    outgoing.get(srcId)!.push(tgtId)
    if (!processed.has(srcId)) queue.push(srcId)
  }

  // Step 1: projective column
  const projectives: DModule[] = []
  for (let v = 1; v <= n; v++) {
    const dimVec = computeDimVec(v, n, qArrows)
    const layers = computeLayersFromDimVec(dimVec, qArrows)
    const nodeType: NodeType = (v === 1 || v === 2 || v === n) ? 'edge' : v === 3 ? 'fork' : 'middle'
    const mod: DModule = { dimVec, id: dimId(dimVec), layers, nodeType, projVertex: v }
    nodes.set(mod.id, mod)
    projectives.push(mod)
  }

  // Seed outgoing with Q^op arrows (P(u) → P(v) for each Q^op arrow u→v)
  const qopArrows = qArrows.map(a => ({ source: a.target, target: a.source }))
  for (const a of qopArrows) {
    const src = projectives[a.source - 1], tgt = projectives[a.target - 1]
    if (src && tgt) addArrow(src.id, tgt.id)
  }

  // Step 2: expansion
  projectives.forEach(p => queue.push(p.id))

  while (queue.length > 0) {
    const id = queue.shift()!
    if (processed.has(id)) continue
    const mod = nodes.get(id)!
    const outs = outgoing.get(id) ?? []
    const needed = mod.nodeType === 'edge' ? 1 : mod.nodeType === 'fork' ? 3 : 2
    if (outs.length < needed) continue
    processed.add(id)

    const quotVec = new Array(n).fill(0)
    for (const tgtId of outs.slice(0, needed)) {
      const tgt = nodes.get(tgtId)!
      for (let i = 0; i < n; i++) quotVec[i] += tgt.dimVec[i]
    }
    for (let i = 0; i < n; i++) quotVec[i] -= mod.dimVec[i]
    if (quotVec.some(x => x < 0) || quotVec.every(x => x === 0)) continue

    const quotId = dimId(quotVec)
    if (!nodes.has(quotId)) {
      const quotMod: DModule = {
        dimVec: quotVec, id: quotId,
        layers: computeLayersFromDimVec(quotVec, qArrows),
        nodeType: mod.nodeType,
        generatedBy: { srcId: id, tgtId: outs[0] },
      }
      nodes.set(quotId, quotMod)
    }

    for (const tgtId of outs.slice(0, needed)) {
      addArrow(tgtId, quotId)
    }
    if (!processed.has(quotId)) queue.push(quotId)
  }

  return { nodes: [...nodes.values()], arrows: arArrows }
}

// Layout: projective column uses Q^op positions; each subsequent node at
// xpos = 2*xpos_target - xpos_source,  ypos = ypos_source
export function computeDnARLayout(
  dArQuiver: DARQuiver,
  quiver: Quiver,
  spacingX = 90,
): Map<string, { x: number; y: number }> {
  const { n, arrows: qArrows } = quiver
  const pos = new Map<string, { x: number; y: number }>()

  // Q^op arrows for projective column position logic
  const qopArrows = qArrows.map(a => ({ source: a.target, target: a.source }))

  // Projective column: same zigzag as QuiverViewer forkOnRight
  // Each P(v) x-position is determined by Q^op arrows (same per-vertex logic)
  const axis3X = (n - 3) * spacingX
  const forkBaseX = (n - 2) * spacingX
  const reflectV1 = qopArrows.some(a => a.source === 1 && a.target === 3)
  const reflectV2 = qopArrows.some(a => a.source === 2 && a.target === 3)

  const chainXMap = new Map<number, number>([[3, axis3X]])
  for (let v = 4; v <= n; v++) {
    const prev = chainXMap.get(v - 1)!
    const exitingFromPrev = qopArrows.some(a => a.source === v - 1 && a.target === v)
    chainXMap.set(v, exitingFromPrev ? prev + spacingX : prev - spacingX)
  }

  function projX(v: number): number {
    if (v === 1) return reflectV1 ? 2 * axis3X - forkBaseX : forkBaseX
    if (v === 2) return reflectV2 ? 2 * axis3X - forkBaseX : forkBaseX
    return chainXMap.get(v) ?? axis3X
  }

  // Y positions for projective column (matching QuiverViewer vy)
  const FORK_Y = 56
  const cy = FORK_Y + 28  // matches R_AR=20 + 8
  const stepY = cy         // P(4) symmetric with P(2) around P(3)

  function projY(v: number): number {
    if (v === 2) return 0
    if (v === 1) return cy
    return cy + (v - 3) * stepY
  }

  // Place projective nodes
  for (const mod of dArQuiver.nodes) {
    if (mod.projVertex !== undefined) {
      pos.set(mod.id, { x: projX(mod.projVertex), y: projY(mod.projVertex) })
    }
  }

  // Place non-projective nodes using generatedBy
  // Process in topological order (BFS from projectives)
  const remaining = dArQuiver.nodes.filter(m => m.projVertex === undefined)
  let safety = 0
  while (remaining.length > 0 && safety++ < 10000) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      const mod = remaining[i]
      if (!mod.generatedBy) { remaining.splice(i, 1); continue }
      const { srcId, tgtId } = mod.generatedBy
      const srcPos = pos.get(srcId), tgtPos = pos.get(tgtId)
      if (!srcPos || !tgtPos) continue
      pos.set(mod.id, { x: 2 * tgtPos.x - srcPos.x, y: srcPos.y })
      remaining.splice(i, 1)
    }
  }

  return pos
}
