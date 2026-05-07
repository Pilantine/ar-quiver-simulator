import { useMemo, useRef } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { DARQuiver, DModule, Quiver } from '../types/mathTypes'
import { computeDnARLayout } from '../math/typeDArQuiver'

type Pt = { x: number; y: number }
type GSNodeColor = { fill: string; stroke: string; textFill: string }

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts
  const s = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y)
  const cross = (O: Pt, A: Pt, B: Pt) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)
  const lower: Pt[] = []
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  const upper: Pt[] = []
  for (const p of [...s].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  lower.pop(); upper.pop()
  return [...lower, ...upper]
}

interface Props {
  nodes: DModule[][]
  edges: [number, number][]
  dArQuiver: DARQuiver
  quiver: Quiver
  selectedTilting?: DModule[] | null
  onSelectTilting?: (t: DModule[]) => void
  exactSESPairs?: { leftId: string; rightId: string }[]
  showExactComponents?: boolean
  gsHighlight?: Map<string, GSNodeColor> | null
}

const SPACING_X = 500
const SPACING_Y = 380
const BOX_W = 200
const BOX_H = 140
const PAD = 14
const MINI_R = 5
const MINI_R_HL = 8
const PADDING = 80

function tiltingKey(t: DModule[]) {
  return t.map(m => m.id).sort().join(',')
}

export default function DTiltingLatticeViewer({
  nodes, edges, dArQuiver, quiver,
  selectedTilting, onSelectTilting,
  exactSESPairs = [],
  showExactComponents = false,
  gsHighlight = null,
}: Props) {
  const rawLayout = useMemo(() => computeDnARLayout(dArQuiver, quiver), [dArQuiver, quiver])

  const miniPos = useMemo(() => {
    const xs = [...rawLayout.values()].map(p => p.x)
    const ys = [...rawLayout.values()].map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const inner_w = BOX_W - 2 * PAD
    const inner_h = BOX_H - 2 * PAD
    const result = new Map<string, Pt>()
    rawLayout.forEach(({ x, y }, id) => {
      result.set(id, {
        x: PAD + ((x - minX) / rangeX) * inner_w,
        y: PAD + ((y - minY) / rangeY) * inner_h,
      })
    })
    return result
  }, [rawLayout])

  const projIds = useMemo(
    () => new Set(dArQuiver.nodes.filter(m => m.projVertex !== undefined).map(m => m.id)),
    [dArQuiver],
  )

  // Injective I(v) = dim vec of P(v) on Q^op (BFS from v following reversed arrows)
  const injIds = useMemo(() => {
    const { n, arrows: qArrows } = quiver
    const qop = qArrows.map(a => ({ source: a.target, target: a.source }))
    const ids = new Set<string>()
    for (let v = 1; v <= n; v++) {
      const vec = new Array(n).fill(0)
      const visited = new Set<number>([v])
      const bfsQ = [v]
      while (bfsQ.length > 0) {
        const curr = bfsQ.shift()!
        vec[curr - 1]++
        for (const a of qop) {
          if (a.source === curr && !visited.has(a.target)) { visited.add(a.target); bfsQ.push(a.target) }
        }
      }
      ids.add(vec.join('_'))
    }
    return ids
  }, [quiver])

  const projNodeIdx = useMemo(() => nodes.findIndex(t => {
    const ids = new Set(t.map(m => m.id))
    return projIds.size === ids.size && [...projIds].every(id => ids.has(id))
  }), [nodes, projIds])

  const injNodeIdx = useMemo(() => nodes.findIndex(t => {
    const ids = new Set(t.map(m => m.id))
    return injIds.size === ids.size && [...injIds].every(id => ids.has(id))
  }), [nodes, injIds])

  const positions = useMemo(() => {
    const adj = new Map<number, number[]>()
    for (const [a, b] of edges) {
      if (!adj.has(a)) adj.set(a, [])
      if (!adj.has(b)) adj.set(b, [])
      adj.get(a)!.push(b)
      adj.get(b)!.push(a)
    }

    const root = projNodeIdx >= 0 ? projNodeIdx : 0
    const rank = new Array(nodes.length).fill(-1)
    const bfsQ = [root]; rank[root] = 0
    while (bfsQ.length > 0) {
      const cur = bfsQ.shift()!
      for (const nb of (adj.get(cur) ?? [])) {
        if (rank[nb] === -1) { rank[nb] = rank[cur] + 1; bfsQ.push(nb) }
      }
    }
    for (let i = 0; i < nodes.length; i++) if (rank[i] === -1) rank[i] = 0

    const byRank = new Map<number, number[]>()
    for (let i = 0; i < nodes.length; i++) {
      if (!byRank.has(rank[i])) byRank.set(rank[i], [])
      byRank.get(rank[i])!.push(i)
    }
    const ranks = [...byRank.keys()].sort((a, b) => a - b)

    const xPos = new Array(nodes.length).fill(0)
    byRank.forEach(group => {
      group.forEach((idx, col) => { xPos[idx] = (col - (group.length - 1) / 2) * SPACING_X })
    })

    for (let pass = 0; pass < 6; pass++) {
      const sweep = pass % 2 === 0 ? ranks : [...ranks].reverse()
      for (const r of sweep) {
        const group = byRank.get(r)!
        if (group.length < 2) continue
        const scored = group.map(idx => {
          const nbrs = (adj.get(idx) ?? []).filter(nb => rank[nb] !== r)
          const score = nbrs.length === 0 ? xPos[idx] : nbrs.reduce((s, nb) => s + xPos[nb], 0) / nbrs.length
          return { idx, score }
        }).sort((a, b) => a.score - b.score)
        scored.forEach(({ idx }, col) => { xPos[idx] = (col - (group.length - 1) / 2) * SPACING_X })
        byRank.set(r, scored.map(s => s.idx))
      }
    }

    return nodes.map((_, i) => ({ x: xPos[i], y: rank[i] * SPACING_Y }))
  }, [nodes, edges, projNodeIdx])

  const selectedKey = selectedTilting ? tiltingKey(selectedTilting) : null

  const allX = positions.map(p => p.x)
  const allY = positions.map(p => p.y)
  const minX = Math.min(...allX) - BOX_W / 2 - PADDING
  const minY = Math.min(...allY) - BOX_H / 2 - PADDING
  const maxX = Math.max(...allX) + BOX_W / 2 + PADDING
  const maxY = Math.max(...allY) + BOX_H / 2 + PADDING
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
          <svg width={vw} height={vh} viewBox={`${minX} ${minY} ${vw} ${vh}`} style={{ overflow: 'visible' }}>
            <defs>
              <marker id="dlm-arrow-mini" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto">
                <path d="M0,0 L0,4 L4,2 z" fill="#cbd5e1" />
              </marker>
            </defs>

            {showExactComponents && (() => {
              const parent = Array.from({ length: nodes.length }, (_, i) => i)
              function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
              for (const [a, b] of edges) {
                const setA = new Set(nodes[a].map(m => m.id))
                const setB = new Set(nodes[b].map(m => m.id))
                const xId = nodes[a].find(m => !setB.has(m.id))?.id
                const yId = nodes[b].find(m => !setA.has(m.id))?.id
                const green = xId && yId && exactSESPairs.some(
                  s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)
                )
                if (green) parent[find(a)] = find(b)
              }
              const compMap = new Map<number, number[]>()
              for (let i = 0; i < nodes.length; i++) {
                const root = find(i)
                if (!compMap.has(root)) compMap.set(root, [])
                compMap.get(root)!.push(i)
              }
              const BLOB_RX = BOX_W / 2 + 34
              const BLOB_RY = BOX_H / 2 + 34
              const ANGLES = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2)
              return (
                <g fill="#f9a8d4" fillOpacity={0.5} stroke="none">
                  {[...compMap.values()].map((group, gi) => {
                    const samples: Pt[] = []
                    for (const i of group) {
                      const p = positions[i]; if (!p) continue
                      for (const a of ANGLES) samples.push({ x: p.x + Math.cos(a) * BLOB_RX, y: p.y + Math.sin(a) * BLOB_RY })
                    }
                    const hull = convexHull(samples)
                    if (hull.length < 2) return null
                    return <polygon key={gi} points={hull.map(p => `${p.x},${p.y}`).join(' ')} />
                  })}
                </g>
              )
            })()}

            {edges.map(([a, b], i) => {
              const pa = positions[a], pb = positions[b]
              if (!pa || !pb) return null
              const [lo, hi] = pa.y > pb.y ? [pa, pb] : [pb, pa]
              const setA = new Set(nodes[a].map(m => m.id))
              const setB = new Set(nodes[b].map(m => m.id))
              const xId = nodes[a].find(m => !setB.has(m.id))?.id
              const yId = nodes[b].find(m => !setA.has(m.id))?.id
              const inExact = !!(xId && yId && exactSESPairs.some(
                s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)
              ))
              return (
                <line key={i}
                  x1={lo.x} y1={lo.y - BOX_H / 2}
                  x2={hi.x} y2={hi.y + BOX_H / 2}
                  stroke={inExact ? '#16a34a' : '#9ca3af'}
                  strokeWidth={inExact ? 2.5 : 1.5}
                />
              )
            })}

            {nodes.map((t, i) => {
              const p = positions[i]
              if (!p) return null
              const isSelected = tiltingKey(t) === selectedKey
              const isProj = i === projNodeIdx
              const isInj = i === injNodeIdx
              const summandIds = new Set(t.map(m => m.id))
              const bx = p.x - BOX_W / 2
              const by = p.y - BOX_H / 2

              return (
                <g key={i} transform={`translate(${bx}, ${by})`}
                  style={{ cursor: onSelectTilting ? 'pointer' : 'default' }}
                  onClick={() => onSelectTilting?.(t)}
                >
                  <rect width={BOX_W} height={BOX_H} rx={6}
                    fill={isSelected ? '#f5f3ff' : isProj ? '#fee2e2' : isInj ? '#fef9c3' : '#f8fafc'}
                    stroke={isSelected ? '#7c3aed' : isProj ? '#dc2626' : isInj ? '#ca8a04' : '#93c5fd'}
                    strokeWidth={isSelected ? 2.5 : (isProj || isInj) ? 2 : 1.5}
                  />
                  {dArQuiver.arrows.map((a, ai) => {
                    const fp = miniPos.get(a.sourceId), tp = miniPos.get(a.targetId)
                    if (!fp || !tp) return null
                    const dx = tp.x - fp.x, dy = tp.y - fp.y
                    const d = Math.sqrt(dx * dx + dy * dy) || 1
                    const ux = dx / d, uy = dy / d
                    const r1 = summandIds.has(a.sourceId) ? MINI_R_HL : MINI_R
                    const r2 = summandIds.has(a.targetId) ? MINI_R_HL : MINI_R
                    return (
                      <line key={ai}
                        x1={fp.x + ux * (r1 + 1)} y1={fp.y + uy * (r1 + 1)}
                        x2={tp.x - ux * (r2 + 2)} y2={tp.y - uy * (r2 + 2)}
                        stroke="#cbd5e1" strokeWidth={0.8}
                        markerEnd="url(#dlm-arrow-mini)"
                      />
                    )
                  })}
                  {dArQuiver.nodes.map(mod => {
                    const mp = miniPos.get(mod.id)
                    if (!mp) return null
                    const hl = summandIds.has(mod.id)
                    const gsColor = gsHighlight?.get(mod.id)
                    const fill = gsColor ? gsColor.fill : hl ? '#ede9fe' : '#f1f5f9'
                    const stroke = gsColor ? gsColor.stroke : hl ? '#7c3aed' : '#93c5fd'
                    const textFill = gsColor ? gsColor.textFill : '#4c1d95'
                    return (
                      <g key={mod.id} transform={`translate(${mp.x}, ${mp.y})`}>
                        <circle r={hl || gsColor ? MINI_R_HL : MINI_R} fill={fill} stroke={stroke} strokeWidth={hl || gsColor ? 1.5 : 1} />
                        {(hl || gsColor) && (
                          <text textAnchor="middle" dominantBaseline="central"
                            fontFamily="monospace" fontWeight="700" fontSize="4" fill={textFill}>
                            {mod.layers[0]?.join('') ?? ''}
                          </text>
                        )}
                      </g>
                    )
                  })}
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
