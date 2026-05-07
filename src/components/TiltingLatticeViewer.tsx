import { useMemo, useRef } from 'react'

type Pt = { x: number; y: number }

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts
  const s = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y)
  const cross = (O: Pt, A: Pt, B: Pt) => (A.x-O.x)*(B.y-O.y) - (A.y-O.y)*(B.x-O.x)
  const lower: Pt[] = []
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p) }
  const upper: Pt[] = []
  for (const p of [...s].reverse()) { while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p) }
  lower.pop(); upper.pop()
  return [...lower, ...upper]
}
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ARQuiver, Quiver, Module } from '../types/mathTypes'
import { computeARLayout } from '../math/arLayout'
import { projectiveAt, injectiveAt } from '../math/arQuiver'

interface Props {
  nodes: Module[][]
  edges: [number, number][]
  arQuiver: ARQuiver
  quiver: Quiver
  selectedTilting?: Module[] | null
  onSelectTilting?: (t: Module[]) => void
  exactSESPairs?: { leftId: string; rightId: string; labels: number[] }[]
  allSESPairs?: { leftId: string; rightId: string; labels: number[] }[]
  showExactComponents?: boolean
  showMutationLabels?: boolean
  exactStructureARSES?: { leftId: string; middleIds: string[]; rightId: string; label: number }[]
  allARSES?: { leftId: string; middleIds: string[]; rightId: string; label: number }[]
}

const SPACING_X = 500
const SPACING_Y = 380
const BOX_W = 180
const BOX_H = 110
const PAD = 14
const MINI_R = 4
const MINI_R_HL = 6
const PADDING = 80

function tiltingKey(t: Module[]) {
  return t.map(m => m.id).sort().join(',')
}

export default function TiltingLatticeViewer({ nodes, edges, arQuiver, quiver, selectedTilting, onSelectTilting, exactSESPairs = [], allSESPairs = [], showExactComponents = false, showMutationLabels = false, exactStructureARSES = [], allARSES = [] }: Props) {
  const layout = useMemo(() => computeARLayout(arQuiver, quiver), [arQuiver, quiver])

  // Normalise AR layout to fit in BOX_W × BOX_H with padding
  const miniPos = useMemo(() => {
    const xs = layout.nodes.map(n => n.cx)
    const ys = layout.nodes.map(n => n.cy)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const inner_w = BOX_W - 2 * PAD
    const inner_h = BOX_H - 2 * PAD
    return new Map(layout.nodes.map(n => [n.id, {
      x: PAD + ((n.cx - minX) / rangeX) * inner_w,
      y: PAD + ((n.cy - minY) / rangeY) * inner_h,
    }]))
  }, [layout])

  const projIds = useMemo(() => new Set(Array.from({ length: quiver.n }, (_, i) => projectiveAt(i + 1, quiver))), [quiver])
  const injIds  = useMemo(() => new Set(Array.from({ length: quiver.n }, (_, i) => injectiveAt(i + 1, quiver))), [quiver])

  const projNodeIdx = useMemo(() => nodes.findIndex(t => {
    const ids = new Set(t.map(m => m.id))
    return projIds.size === ids.size && [...projIds].every(id => ids.has(id))
  }), [nodes, projIds])

  const injNodeIdx = useMemo(() => nodes.findIndex(t => {
    const ids = new Set(t.map(m => m.id))
    return injIds.size === ids.size && [...injIds].every(id => ids.has(id))
  }), [nodes, injIds])

  // Lattice node positions: BFS from injectives (top) toward projectives (bottom)
  const positions = useMemo(() => {
    const rootIdx = projNodeIdx
    const injIdx  = injNodeIdx
    const root = rootIdx >= 0 ? rootIdx : 0

    const adj = new Map<number, number[]>()
    for (const [a, b] of edges) {
      if (!adj.has(a)) adj.set(a, [])
      if (!adj.has(b)) adj.set(b, [])
      adj.get(a)!.push(b)
      adj.get(b)!.push(a)
    }

    // BFS from injectives → rank 0 at top
    const injRoot = injIdx >= 0 ? injIdx : root
    const rank = new Array(nodes.length).fill(-1)
    const bfsQ = [injRoot]; rank[injRoot] = 0
    while (bfsQ.length > 0) {
      const cur = bfsQ.shift()!
      for (const nb of (adj.get(cur) ?? [])) {
        if (rank[nb] === -1) { rank[nb] = rank[cur] + 1; bfsQ.push(nb) }
      }
    }
    for (let i = 0; i < nodes.length; i++) if (rank[i] === -1) rank[i] = 0

    // Build byRank groups
    const byRank = new Map<number, number[]>()
    for (let i = 0; i < nodes.length; i++) {
      if (!byRank.has(rank[i])) byRank.set(rank[i], [])
      byRank.get(rank[i])!.push(i)
    }
    const ranks = [...byRank.keys()].sort((a, b) => a - b)

    // Assign initial x by index order within each rank
    const xPos = new Array(nodes.length).fill(0)
    byRank.forEach(group => {
      group.forEach((idx, col) => { xPos[idx] = (col - (group.length - 1) / 2) * SPACING_X })
    })

    // Barycenter sweeps (top-down then bottom-up, 3 rounds)
    for (let pass = 0; pass < 6; pass++) {
      const sweep = pass % 2 === 0 ? ranks : [...ranks].reverse()
      for (const r of sweep) {
        const group = byRank.get(r)!
        if (group.length < 2) continue
        // score each node by average x of its neighbours in other ranks
        const scored = group.map(idx => {
          const nbrs = (adj.get(idx) ?? []).filter(nb => rank[nb] !== r)
          const score = nbrs.length === 0 ? xPos[idx] : nbrs.reduce((s, nb) => s + xPos[nb], 0) / nbrs.length
          return { idx, score }
        }).sort((a, b) => a.score - b.score)
        // reassign evenly-spaced x in sorted order
        scored.forEach(({ idx }, col) => { xPos[idx] = (col - (group.length - 1) / 2) * SPACING_X })
        byRank.set(r, scored.map(s => s.idx))
      }
    }

    const pos = new Array(nodes.length).fill(null) as { x: number; y: number }[]
    for (let i = 0; i < nodes.length; i++) {
      pos[i] = { x: xPos[i], y: rank[i] * SPACING_Y }
    }
    return pos
  }, [nodes, edges, quiver])

  const selectedKey = selectedTilting ? tiltingKey(selectedTilting) : null

  // Pre-compute edge label positions (overlap resolution) so they can be rendered on top of nodes
  const LABEL_R = 36
  interface LabelInfo { i: number; x: number; y: number; dx: number; dy: number; t: number }
  const edgeLabelInfos: LabelInfo[] = []
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i]
    const pa = positions[a], pb = positions[b]
    if (!pa || !pb) continue
    const [lo, hi] = pa.y > pb.y ? [pa, pb] : [pb, pa]
    const x1 = lo.x, y1 = lo.y - BOX_H / 2
    const x2 = hi.x, y2 = hi.y + BOX_H / 2
    edgeLabelInfos.push({ i, x: (x1 + x2) / 2, y: (y1 + y2) / 2, dx: x2 - x1, dy: y2 - y1, t: 0.5 })
  }
  for (let iter = 0; iter < 20; iter++) {
    for (let a = 0; a < edgeLabelInfos.length; a++) {
      for (let b = a + 1; b < edgeLabelInfos.length; b++) {
        const la = edgeLabelInfos[a], lb = edgeLabelInfos[b]
        const dist = Math.sqrt((la.x - lb.x) ** 2 + (la.y - lb.y) ** 2)
        if (dist < LABEL_R * 2 + 8) {
          const elen_a = Math.sqrt(la.dx ** 2 + la.dy ** 2) || 1
          const elen_b = Math.sqrt(lb.dx ** 2 + lb.dy ** 2) || 1
          const step = (LABEL_R * 2 + 8 - dist) / 2
          const dot_a = (la.x - lb.x) * la.dx / elen_a + (la.y - lb.y) * la.dy / elen_a
          const dot_b = (lb.x - la.x) * lb.dx / elen_b + (lb.y - la.y) * lb.dy / elen_b
          la.t += (dot_a >= 0 ? 1 : -1) * step / elen_a
          lb.t += (dot_b >= 0 ? 1 : -1) * step / elen_b
          la.t = Math.max(0.1, Math.min(0.9, la.t))
          lb.t = Math.max(0.1, Math.min(0.9, lb.t))
          const [paa, pab] = [positions[edges[la.i][0]], positions[edges[la.i][1]]]
          if (paa && pab) {
            const [loa, hia] = paa.y > pab.y ? [paa, pab] : [pab, paa]
            la.x = loa.x + la.t * (hia.x - loa.x)
            la.y = (loa.y - BOX_H / 2) + la.t * (hia.y + BOX_H / 2 - (loa.y - BOX_H / 2))
          }
          const [pba, pbb] = [positions[edges[lb.i][0]], positions[edges[lb.i][1]]]
          if (pba && pbb) {
            const [lob, hib] = pba.y > pbb.y ? [pba, pbb] : [pbb, pba]
            lb.x = lob.x + lb.t * (hib.x - lob.x)
            lb.y = (lob.y - BOX_H / 2) + lb.t * (hib.y + BOX_H / 2 - (lob.y - BOX_H / 2))
          }
        }
      }
    }
  }
  // Push labels away from node rectangles
  for (let iter = 0; iter < 30; iter++) {
    for (const la of edgeLabelInfos) {
      for (let j = 0; j < nodes.length; j++) {
        const np = positions[j]; if (!np) continue
        // nearest point on node rect to label center
        const nx = Math.max(np.x - BOX_W / 2, Math.min(np.x + BOX_W / 2, la.x))
        const ny = Math.max(np.y - BOX_H / 2, Math.min(np.y + BOX_H / 2, la.y))
        const ddx = la.x - nx, ddy = la.y - ny
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        const minDist = LABEL_R + 6
        if (dist < minDist) {
          const elen = Math.sqrt(la.dx ** 2 + la.dy ** 2) || 1
          const step = (minDist - dist + 2) / elen
          // dot product of (label→nearestPt) with edge direction to decide which way to slide
          const dot = (nx - la.x) * la.dx / elen + (ny - la.y) * la.dy / elen
          la.t += (dot >= 0 ? -1 : 1) * step
          la.t = Math.max(0.1, Math.min(0.9, la.t))
          const [paa, pab] = [positions[edges[la.i][0]], positions[edges[la.i][1]]]
          if (paa && pab) {
            const [loa, hia] = paa.y > pab.y ? [paa, pab] : [pab, paa]
            la.x = loa.x + la.t * (hia.x - loa.x)
            la.y = (loa.y - BOX_H / 2) + la.t * (hia.y + BOX_H / 2 - (loa.y - BOX_H / 2))
          }
        }
      }
    }
  }

  const labelByEdge = new Map(edgeLabelInfos.map(l => [l.i, l]))

  const allX = positions.filter(Boolean).map(p => p.x)
  const allY = positions.filter(Boolean).map(p => p.y)
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
              <marker id="lm-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#9ca3af" />
              </marker>
              <marker id="lm-arrow-mini" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto">
                <path d="M0,0 L0,4 L4,2 z" fill="#cbd5e1" />
              </marker>
            </defs>

            {/* pink component areas */}
            {showExactComponents && (() => {
              // build components from green edges only
              const parent = Array.from({ length: nodes.length }, (_, i) => i)
              function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
              function union(x: number, y: number) { parent[find(x)] = find(y) }

              for (const [a, b] of edges) {
                const setA = new Set(nodes[a].map(m => m.id))
                const setB = new Set(nodes[b].map(m => m.id))
                const xId = nodes[a].find(m => !setB.has(m.id))?.id
                const yId = nodes[b].find(m => !setA.has(m.id))?.id
                const green = xId && yId && exactSESPairs.some(
                  s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)
                )
                if (green) union(a, b)
              }

              const compMap = new Map<number, number[]>()
              for (let i = 0; i < nodes.length; i++) {
                const root = find(i)
                if (!compMap.has(root)) compMap.set(root, [])
                compMap.get(root)!.push(i)
              }

              const allGreenEdges: [number, number][] = []
              for (const [a, b] of edges) {
                const setA = new Set(nodes[a].map(m => m.id))
                const setB = new Set(nodes[b].map(m => m.id))
                const xId = nodes[a].find(m => !setB.has(m.id))?.id
                const yId = nodes[b].find(m => !setA.has(m.id))?.id
                const green = xId && yId && exactSESPairs.some(
                  s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)
                )
                if (green) allGreenEdges.push([a, b])
              }

              const allInComponent = new Set([...compMap.values()].flat())
              const BLOB_RX = BOX_W / 2 + 34
              const BLOB_RY = BOX_H / 2 + 34
              const EDGE_SW = 30

              const ANGLES = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2)

              return (
                <g key="components" fill="#f9a8d4" fillOpacity={0.5} stroke="none">
                  {/* filled convex hull per component */}
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
                  {/* edge strokes */}
                  {allGreenEdges.map(([a, b], i) => {
                    const pa = positions[a], pb = positions[b]
                    if (!pa || !pb) return null
                    const [lo, hi] = pa.y > pb.y ? [pa, pb] : [pb, pa]
                    return <line key={i}
                      x1={lo.x} y1={lo.y - BOX_H / 2}
                      x2={hi.x} y2={hi.y + BOX_H / 2}
                      stroke="#f9a8d4" strokeOpacity={0.5} strokeWidth={EDGE_SW} strokeLinecap="round" fill="none" />
                  })}
                  {/* ellipse around each node */}
                  {[...allInComponent].map(i => {
                    const p = positions[i]; if (!p) return null
                    return <ellipse key={i} cx={p.x} cy={p.y} rx={BLOB_RX} ry={BLOB_RY} fillOpacity={0.5} />
                  })}
                </g>
              )
            })()}

            {/* lattice edges (lines only — labels rendered after nodes) */}
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

            {/* tilting nodes */}
            {nodes.map((t, i) => {
              const p = positions[i]
              if (!p) return null
              const isSelected = tiltingKey(t) === selectedKey
              const isProj = i === projNodeIdx
              const isInj  = i === injNodeIdx
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

                  {/* mini AR arrows */}
                  {layout.arrows.map((a, ai) => {
                    const fp = miniPos.get(a.fromId), tp = miniPos.get(a.toId)
                    if (!fp || !tp) return null
                    const dx = tp.x - fp.x, dy = tp.y - fp.y
                    const d = Math.sqrt(dx * dx + dy * dy) || 1
                    const ux = dx / d, uy = dy / d
                    const r = summandIds.has(a.fromId) ? MINI_R_HL : MINI_R
                    const r2 = summandIds.has(a.toId) ? MINI_R_HL : MINI_R
                    return (
                      <line key={ai}
                        x1={fp.x + ux * (r + 1)} y1={fp.y + uy * (r + 1)}
                        x2={tp.x - ux * (r2 + 2)} y2={tp.y - uy * (r2 + 2)}
                        stroke="#cbd5e1" strokeWidth={0.8}
                        markerEnd="url(#lm-arrow-mini)"
                      />
                    )
                  })}

                  {/* mini AR nodes */}
                  {layout.nodes.map(n => {
                    const mp = miniPos.get(n.id)
                    if (!mp) return null
                    const hl = summandIds.has(n.id)
                    return (
                      <g key={n.id} transform={`translate(${mp.x}, ${mp.y})`}>
                        <circle
                          r={hl ? MINI_R_HL : MINI_R}
                          fill={hl ? '#e9d5ff' : '#dbeafe'}
                          stroke={hl ? '#7c3aed' : '#93c5fd'}
                          strokeWidth={hl ? 1.5 : 1}
                        />
                        {hl && (
                          <text textAnchor="middle" dominantBaseline="central"
                            fontFamily="monospace" fontWeight="700" fontSize="4.5"
                            fill="#4c1d95"
                          >{n.label}</text>
                        )}
                      </g>
                    )
                  })}

                  {/* all AR rects on projective node — exact structure ones green, others grey */}
                  {isProj && allARSES.map(ses => {
                    const A = miniPos.get(ses.leftId)
                    const R = miniPos.get(ses.rightId)
                    if (!A || !R) return null
                    let pts: Pt[] | null = null
                    if (ses.middleIds.length === 1) {
                      const B = miniPos.get(ses.middleIds[0])
                      if (!B) return null
                      pts = [A, B, R, { x: A.x + R.x - B.x, y: A.y + R.y - B.y }]
                    } else if (ses.middleIds.length === 2) {
                      const B = miniPos.get(ses.middleIds[0]), C = miniPos.get(ses.middleIds[1])
                      if (!B || !C) return null
                      pts = [A, B, R, C]
                    }
                    if (!pts) return null
                    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
                    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
                    const inExact = exactStructureARSES.some(e => e.label === ses.label)
                    return (
                      <g key={ses.label}>
                        {inExact && (
                          <polygon
                            points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="#bbf7d0" fillOpacity={0.55} stroke="#16a34a" strokeWidth={0.6}
                          />
                        )}
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                          fontFamily="monospace" fontWeight="800" fontSize="5"
                          fill={inExact ? '#15803d' : '#64748b'}>
                          {ses.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
            {/* edge labels on top of everything */}
            {showMutationLabels && edges.map(([a, b], i) => {
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
              const matchedSES = xId && yId ? allSESPairs.find(
                s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)
              ) : undefined
              if (!matchedSES || matchedSES.labels.length === 0) return null
              const lbl = labelByEdge.get(i)
              const mx = lbl ? lbl.x : (lo.x + hi.x) / 2
              const my = lbl ? lbl.y : (lo.y - BOX_H / 2 + hi.y + BOX_H / 2) / 2
              return (
                <g key={i} transform={`translate(${mx}, ${my})`}>
                  <circle r={32 + (matchedSES.labels.length - 1) * 8} fill="white" stroke={inExact ? '#16a34a' : '#9ca3af'} strokeWidth={2.5} />
                  <text textAnchor="middle" dominantBaseline="central"
                    fontFamily="monospace" fontWeight="700" fontSize="28" fill={inExact ? '#15803d' : '#6b7280'}>
                    {matchedSES.labels.join(',')}
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
