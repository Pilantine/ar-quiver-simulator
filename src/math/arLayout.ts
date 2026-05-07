import type { ARQuiver, Quiver } from '../types/mathTypes'
import { projectiveAt } from './arQuiver'

export interface LayoutNode { id: string; label: string; cx: number; cy: number }
export interface LayoutArrow { x1: number; y1: number; x2: number; y2: number; fromId: string; toId: string }
export interface ARLayout { nodes: LayoutNode[]; arrows: LayoutArrow[] }

const OFFSET_X = 80
const SPACING_Y = 90
const NODE_R = 31

function clamp(x1: number, y1: number, x2: number, y2: number, r: number): [number, number, number, number] {
  const dx = x2 - x1, dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return [x1, y1, x2, y2]
  const ux = dx / dist, uy = dy / dist
  return [x1 + ux * r, y1 + uy * r, x2 - ux * r, y2 - uy * r]
}

export function computeARLayout(arQuiver: ARQuiver, quiver: Quiver): ARLayout {
  const { n } = quiver

  const projX: number[] = new Array(n + 1).fill(0)
  projX[n] = 0
  for (let v = n - 1; v >= 1; v--) {
    const fwd = quiver.arrows.some(a => a.source === v && a.target === v + 1)
    projX[v] = fwd ? projX[v + 1] + OFFSET_X : projX[v + 1] - OFFSET_X
  }

  const projNodes: LayoutNode[] = []
  for (let v = 1; v <= n; v++) {
    const id = projectiveAt(v, quiver)
    const m = arQuiver.nodes.find(x => x.id === id)
    if (!m) continue
    projNodes.push({ id, label: m.label, cx: projX[v], cy: (v - 1) * SPACING_Y })
  }

  const arrows: LayoutArrow[] = []
  for (let v = 1; v < n; v++) {
    const srcId = projectiveAt(v, quiver)
    const tgtId = projectiveAt(v + 1, quiver)
    const fwd = quiver.arrows.some(a => a.source === v && a.target === v + 1)
    const fromNode = fwd ? projNodes.find(p => p.id === tgtId) : projNodes.find(p => p.id === srcId)
    const toNode   = fwd ? projNodes.find(p => p.id === srcId) : projNodes.find(p => p.id === tgtId)
    if (!fromNode || !toNode) continue
    const [ax1, ay1, ax2, ay2] = clamp(fromNode.cx, fromNode.cy, toNode.cx, toNode.cy, NODE_R + 3)
    arrows.push({ x1: ax1, y1: ay1, x2: ax2, y2: ay2, fromId: fromNode.id, toId: toNode.id })
  }

  const extraNodes: LayoutNode[] = []
  const placed = new Set<string>(projNodes.map(p => p.id))
  const posMap = new Map<string, LayoutNode>()
  projNodes.forEach(p => posMap.set(p.id, p))

  const outgoing = new Map<string, LayoutNode[]>()
  const isEdge = new Set<string>()

  for (let v = 1; v < n; v++) {
    const fwd = quiver.arrows.some(a => a.source === v && a.target === v + 1)
    const fromNode = fwd ? projNodes[v] : projNodes[v - 1]
    const toNode   = fwd ? projNodes[v - 1] : projNodes[v]
    if (!fromNode || !toNode) continue
    if (!outgoing.has(fromNode.id)) outgoing.set(fromNode.id, [])
    outgoing.get(fromNode.id)!.push(toNode)
  }

  isEdge.add(projNodes[0].id)
  isEdge.add(projNodes[n - 1].id)

  function computeQuotient(srcId: string, targets: LayoutNode[]): LayoutNode | null {
    const srcM = arQuiver.nodes.find(x => x.id === srcId)
    if (!srcM) return null
    const srcVec = new Map<number, number>()
    for (let k = srcM.i; k <= srcM.j; k++) srcVec.set(k, 1)
    const tgtSum = new Map<number, number>()
    for (const t of targets) {
      const tm = arQuiver.nodes.find(x => x.id === t.id)
      if (!tm) continue
      for (let k = tm.i; k <= tm.j; k++) tgtSum.set(k, (tgtSum.get(k) ?? 0) + 1)
    }
    const qSet = [...tgtSum.entries()]
      .map(([k, v]) => ({ k, diff: v - (srcVec.get(k) ?? 0) }))
      .filter(x => x.diff > 0)
      .sort((a, b) => a.k - b.k)
    if (qSet.length === 0) return null
    const qi = qSet[0].k, qj = qSet[qSet.length - 1].k
    if (qi < 1 || qj > n) return null
    const qid = `${qi}_${qj}`
    const qm = arQuiver.nodes.find(x => x.id === qid)
    if (!qm) return null
    if (!placed.has(qid)) {
      const srcNode = posMap.get(srcId)!
      const qNode: LayoutNode = { id: qid, label: qm.label, cx: srcNode.cx + 2 * OFFSET_X, cy: srcNode.cy }
      placed.add(qid)
      extraNodes.push(qNode)
      posMap.set(qid, qNode)
      return qNode
    }
    return posMap.get(qid)!
  }

  const queue = [...projNodes]
  const processed = new Set<string>()
  while (queue.length > 0) {
    const pNode = queue.shift()!
    const targets = outgoing.get(pNode.id) ?? []
    const needed = isEdge.has(pNode.id) ? 1 : 2
    if (targets.length < needed) continue
    const stateKey = `${pNode.id}:${targets.length}`
    if (processed.has(stateKey)) continue
    processed.add(stateKey)
    const qNode = computeQuotient(pNode.id, targets)
    if (!qNode) continue
    if (isEdge.has(pNode.id)) isEdge.add(qNode.id)
    for (const t of targets) {
      const tNode = posMap.get(t.id)!
      if (!outgoing.has(t.id)) outgoing.set(t.id, [])
      if (!outgoing.get(t.id)!.find(x => x.id === qNode.id)) {
        outgoing.get(t.id)!.push(qNode)
        const [ax1, ay1, ax2, ay2] = clamp(tNode.cx, tNode.cy, qNode.cx, qNode.cy, NODE_R + 3)
        arrows.push({ x1: ax1, y1: ay1, x2: ax2, y2: ay2, fromId: tNode.id, toId: qNode.id })
        queue.push(tNode)
      }
    }
    queue.push(qNode)
  }

  return { nodes: [...projNodes, ...extraNodes], arrows }
}
