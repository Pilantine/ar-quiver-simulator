import { useEffect, useRef } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ARQuiver, Quiver, Module, Rect } from '../types/mathTypes'
import type { SES } from '../math/exactSequences'
import { projectiveAt } from '../math/arQuiver'

interface Badge { label: number; leftId: string; rightId: string }

type GSNodeColor = { fill: string; stroke: string; textFill: string }
type GSHighlight = Map<string, GSNodeColor>

interface Props {
  arQuiver: ARQuiver
  quiver: Quiver
  onPositions?: (positions: Map<string, number>) => void
  onYPositions?: (positions: Map<string, number>) => void
  selectedSES?: SES | null
  badges?: Badge[]
  selectedTilting?: Module[] | null
  sesRects?: Rect[]
  gsHighlight?: GSHighlight | null
  showTauArrows?: boolean
}

const R = 22
const SPACING_Y = 90
const OFFSET_X = 80
const PADDING = 80

function clampedEndpoint(
  x1: number, y1: number,
  x2: number, y2: number,
  r: number,
): [number, number, number, number] {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return [x1, y1, x2, y2]
  const ux = dx / dist
  const uy = dy / dist
  return [x1 + ux * r, y1 + uy * r, x2 - ux * r, y2 - uy * r]
}

export default function ARQuiverViewer({ arQuiver, quiver, onPositions, onYPositions, selectedSES, badges = [], selectedTilting, sesRects = [], gsHighlight, showTauArrows = false }: Props) {
  const { n } = quiver

  const projX: number[] = new Array(n + 1).fill(0)
  projX[n] = 0
  for (let v = n - 1; v >= 1; v--) {
    const fwdInQ = quiver.arrows.some(a => a.source === v && a.target === v + 1)
    projX[v] = fwdInQ ? projX[v + 1] + OFFSET_X : projX[v + 1] - OFFSET_X
  }

  type ProjNode = { id: string; label: string; cx: number; cy: number }
  const projNodes: ProjNode[] = []
  for (let v = 1; v <= n; v++) {
    const id = projectiveAt(v, quiver)
    const m = arQuiver.nodes.find(x => x.id === id)
    if (!m) continue
    projNodes.push({
      id,
      label: m.label,
      cx: projX[v],
      cy: (v - 1) * SPACING_Y,
    })
  }

  type Arrow = { x1: number; y1: number; x2: number; y2: number; fromId: string; toId: string }
  const arrows: Arrow[] = []
  for (let v = 1; v < n; v++) {
    const srcId = projectiveAt(v, quiver)
    const tgtId = projectiveAt(v + 1, quiver)
    const fwd = quiver.arrows.some(a => a.source === v && a.target === v + 1)
    const fromNode = fwd
      ? projNodes.find(p => p.id === tgtId)
      : projNodes.find(p => p.id === srcId)
    const toNode = fwd
      ? projNodes.find(p => p.id === srcId)
      : projNodes.find(p => p.id === tgtId)
    if (!fromNode || !toNode) continue
    const [ax1, ay1, ax2, ay2] = clampedEndpoint(
      fromNode.cx, fromNode.cy,
      toNode.cx, toNode.cy,
      R + 3,
    )
    arrows.push({ x1: ax1, y1: ay1, x2: ax2, y2: ay2, fromId: fromNode.id, toId: toNode.id })
  }

  // --- All columns: repeat quotient rule until no new nodes ---
  const extraNodes: ProjNode[] = []
  const placed = new Set<string>(projNodes.map(p => p.id))
  const posMap = new Map<string, ProjNode>()
  projNodes.forEach(p => posMap.set(p.id, p))
  // tauMap: newly generated node id → the source node id that produced it
  const tauMap = new Map<string, string>()

  const outgoing = new Map<string, ProjNode[]>()
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

  function computeQuotient(srcId: string, targets: ProjNode[]): ProjNode | null {
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
      const qNode: ProjNode = { id: qid, label: qm.label, cx: srcNode.cx + 2 * OFFSET_X, cy: srcNode.cy }
      placed.add(qid)
      extraNodes.push(qNode)
      posMap.set(qid, qNode)
      tauMap.set(qid, srcId)
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
        const [ax1, ay1, ax2, ay2] = clampedEndpoint(tNode.cx, tNode.cy, qNode.cx, qNode.cy, R + 3)
        arrows.push({ x1: ax1, y1: ay1, x2: ax2, y2: ay2, fromId: tNode.id, toId: qNode.id })
        queue.push(tNode)
      }
    }
    queue.push(qNode)
  }

  const allNodes = [...projNodes, ...extraNodes]

  useEffect(() => {
    if (onPositions) {
      const xMap = new Map<string, number>()
      allNodes.forEach(p => xMap.set(p.id, p.cx))
      onPositions(xMap)
    }
    if (onYPositions) {
      const yMap = new Map<string, number>()
      allNodes.forEach(p => yMap.set(p.id, p.cy))
      onYPositions(yMap)
    }
  }, [allNodes.map(p => p.id + p.cx + p.cy).join(',')])

  const hlNodes = new Set<string>()
  if (selectedSES) {
    hlNodes.add(selectedSES.left.id)
    selectedSES.middle.forEach(m => hlNodes.add(m.id))
    hlNodes.add(selectedSES.right.id)
  }

  const tiltNodes = new Set<string>(selectedTilting?.map(m => m.id) ?? [])

  const allX = allNodes.map(p => p.cx)
  const allY = allNodes.map(p => p.cy)
  const minX = Math.min(...allX) - PADDING
  const minY = Math.min(...allY) - PADDING
  const maxX = Math.max(...allX) + PADDING
  const maxY = Math.max(...allY) + PADDING
  const vw = maxX - minX
  const vh = maxY - minY

  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="absolute inset-0 flex flex-col">
      <TransformWrapper minScale={0.05} maxScale={5} limitToBounds={false} wheel={{ step: 0.001 }} onInit={ref => {
        const el = containerRef.current
        if (!el) return
        const observer = new ResizeObserver(entries => {
          const { width, height } = entries[0].contentRect
          if (!width || !height) return
          observer.disconnect()
          const scale = Math.min((width - 80) / vw, (height - 80) / vh, 1)
          const x = (width - vw * scale) / 2
          const y = (height - vh * scale) / 2
          ref.setTransform(x, y, scale, 0)
        })
        observer.observe(el)
      }}>
        <TransformComponent wrapperStyle={{ width: '100%', flex: 1 }}>
      <svg
        width={vw}
        height={vh}
        viewBox={`${minX} ${minY} ${vw} ${vh}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#6b7280" />
          </marker>
          <marker id="arrowhead-tau" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#9ca3af" />
          </marker>
        </defs>
        {showTauArrows && [...tauMap.entries()].map(([newId, srcId]) => {
          const np = posMap.get(newId), sp = posMap.get(srcId)
          if (!np || !sp) return null
          const [x1, y1, x2, y2] = clampedEndpoint(np.cx, np.cy, sp.cx, sp.cy, R + 3)
          return (
            <line key={`tau-${newId}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5,3"
              markerEnd="url(#arrowhead-tau)" />
          )
        })}
        {sesRects.map((r, i) => (
          <polygon key={i}
            points={r.map(p => `${p.x},${p.y}`).join(' ')}
            fill="#bbf7d0" fillOpacity={0.35} stroke="#86efac" strokeWidth={1} />
        ))}
        {arrows.map((a, i) => (
          <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="#6b7280" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
        ))}
        {badges.map((b, i) => {
          const ln = posMap.get(b.leftId)
          const rn = posMap.get(b.rightId)
          if (!ln || !rn) return null
          const bx = (ln.cx + rn.cx) / 2
          const by = ln.cy
          return (
            <g key={i} transform={`translate(${bx}, ${by})`}>
              <circle r={11} fill="#10b981" />
              <text textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif" fontWeight="700" fontSize="10" fill="white">
                {b.label}
              </text>
            </g>
          )
        })}
        {allNodes.map(p => {
          const gsColor = gsHighlight?.get(p.id)
          const ses = hlNodes.has(p.id)
          const tilt = tiltNodes.has(p.id)
          const fill = gsColor ? gsColor.fill : tilt ? '#ede9fe' : ses ? '#bbf7d0' : 'white'
          const stroke = gsColor ? gsColor.stroke : tilt ? '#7c3aed' : ses ? '#16a34a' : '#6366f1'
          const textFill = gsColor ? gsColor.textFill : tilt ? '#4c1d95' : ses ? '#14532d' : '#4f46e5'
          const strokeW = (ses || tilt || gsColor) ? 2.5 : 1.5
          return (
            <g key={p.id} transform={`translate(${p.cx}, ${p.cy})`}>
              <circle r={R} fill={fill} stroke={stroke} strokeWidth={strokeW} />
              <text textAnchor="middle" dominantBaseline="middle"
                fontFamily="monospace" fontWeight="700" fontSize="9" fill={textFill}>
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
        </TransformComponent>
      </TransformWrapper>
      <div className="absolute bottom-3 right-3 text-[10px] text-gray-400 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 select-none pointer-events-none">
        scroll to zoom · drag to pan
      </div>
    </div>
  )
}
