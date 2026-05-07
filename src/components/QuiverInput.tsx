import { useState } from 'react'
import type { Arrow, QuiverType } from '../types/mathTypes'

interface Props {
  onGenerate: (n: number, orientation: 'custom', quiverType: QuiverType, customArrows?: Arrow[]) => void
  onTypeChange?: (type: QuiverType) => void
  onReset?: () => void
}

// D_n edges (n-1 total):
//   index 0 : 1–3  (fork top),   forward = 1→3
//   index 1 : 2–3  (fork bottom), forward = 2→3
//   index k≥2: (k+1)–(k+2)       forward = (k+1)→(k+2)  i.e. 3→4, 4→5, ...
function dnEdgeEndpoints(k: number): [number, number] {
  if (k === 0) return [1, 3]
  if (k === 1) return [2, 3]
  return [k + 1, k + 2]
}

export default function QuiverInput({ onGenerate, onTypeChange, onReset }: Props) {
  const [quiverType, setQuiverType] = useState<QuiverType>('A')
  const [n, setN] = useState(4)

  const [edgeDirs, setEdgeDirs] = useState<boolean[]>(Array(6).fill(true))

  // Type D
  const [dnEdgeDirs, setDnEdgeDirs] = useState<boolean[]>(Array(6).fill(true))

  const clampedN = quiverType === 'D' ? Math.max(4, Math.min(n, 7)) : Math.max(1, Math.min(n, 7))

  // Type A: n-1 edge dirs
  const syncedDirsA = Array.from({ length: Math.max(clampedN - 1, 0) }, (_, k) =>
    k < edgeDirs.length ? edgeDirs[k] : true,
  )

  // Type D: n-1 edge dirs (0=fork-top, 1=fork-bottom, 2..n-2=chain)
  const syncedDirsD = Array.from({ length: Math.max(clampedN - 1, 0) }, (_, k) =>
    k < dnEdgeDirs.length ? dnEdgeDirs[k] : true,
  )

  function toggleEdgeA(k: number) {
    setEdgeDirs(prev => { const next = [...prev]; while (next.length <= k) next.push(true); next[k] = !next[k]; return next })
  }

  function toggleEdgeD(k: number) {
    setDnEdgeDirs(prev => { const next = [...prev]; while (next.length <= k) next.push(true); next[k] = !next[k]; return next })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (quiverType === 'D') {
      const arrows: Arrow[] = syncedDirsD.map((fwd, k) => {
        const [a, b] = dnEdgeEndpoints(k)
        return fwd ? { source: a, target: b } : { source: b, target: a }
      })
      onGenerate(clampedN, 'custom', 'D', arrows)
      return
    }
    const arrows: Arrow[] = syncedDirsA.map((fwd, k) =>
      fwd ? { source: k + 1, target: k + 2 } : { source: k + 2, target: k + 1 },
    )
    onGenerate(clampedN, 'custom', 'A', arrows)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Quiver type */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 w-6">Type</label>
        <select
          value={quiverType}
          onChange={e => { const t = e.target.value as QuiverType; setQuiverType(t); onTypeChange?.(t); onReset?.() }}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="A">Type A</option>
          <option value="D">Type D</option>
        </select>
      </div>

      {/* n input */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 w-6">n</label>
        <input
          type="number"
          min={quiverType === 'D' ? 4 : 1}
          max={7}
          value={n}
          onChange={e => { setN(Number(e.target.value)); onReset?.() }}
          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-xs text-gray-400">{quiverType === 'D' ? '(4 – 7)' : '(1 – 7)'}</span>
      </div>

      {/* Type A chain SVG */}
      {quiverType === 'A' && clampedN >= 2 && (() => {
        const R = 10, AH = 5
        const G = Math.min(44, Math.floor((220 - 2 * R - 8) / (clampedN - 1)))
        const svgW = (clampedN - 1) * G + 2 * R + 8
        const svgH = 2 * R + 8
        const cy = svgH / 2
        const vx = (v: number) => (v - 1) * G + R + 4
        function arrowPts(x1: number, y1: number, x2: number, y2: number) {
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx*dx + dy*dy) || 1
          const ux = dx/len, uy = dy/len, px = -uy, py = ux
          return `${x2},${y2} ${x2-ux*AH+px*AH*0.6},${y2-uy*AH+py*AH*0.6} ${x2-ux*AH-px*AH*0.6},${y2-uy*AH-py*AH*0.6}`
        }
        return (
          <div className="bg-gray-50 rounded p-2">
            <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
              {Array.from({ length: clampedN - 1 }, (_, k) => {
                const fwd = syncedDirsA[k] ?? true
                const x1 = vx(fwd ? k + 1 : k + 2), y1 = cy
                const x2 = vx(fwd ? k + 2 : k + 1), y2 = cy
                const dx = x2 - x1, len = Math.abs(dx)
                const tx = x1 + (dx / len) * R, hx = x2 - (dx / len) * R
                return (
                  <g key={k} onClick={() => toggleEdgeA(k)} style={{ cursor: 'pointer' }}>
                    <line x1={tx} y1={y1} x2={hx} y2={y2} stroke="#6366f1" strokeWidth={1.5} />
                    <polygon points={arrowPts(tx, y1, hx, y2)} fill="#6366f1" />
                    <line x1={tx} y1={y1} x2={hx} y2={y2} stroke="transparent" strokeWidth={10} />
                  </g>
                )
              })}
              {Array.from({ length: clampedN }, (_, k) => (
                <g key={k}>
                  <circle cx={vx(k + 1)} cy={cy} r={R} fill="white" stroke="#6366f1" strokeWidth={1.5} />
                  <text x={vx(k + 1)} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontFamily="monospace" fontWeight="700" fill="#4f46e5">{k + 1}</text>
                </g>
              ))}
            </svg>
          </div>
        )
      })()}

      {/* Type D fork SVG */}
      {quiverType === 'D' && (() => {
        const R = 10, AH = 5
        const G = Math.min(44, Math.floor((220 - 2 * R - 8) / (clampedN - 1)))
        const forkY = 36
        const svgW = (clampedN - 1) * G + 2 * R + 8
        const svgH = 2 * forkY + 2 * R + 8
        const cy = svgH / 2
        // vertex positions: 1 top-left, 2 bottom-left, 3..n linear right
        const vx = (v: number) => v === 1 || v === 2 ? R + 4 : (v - 2) * G + R + 4
        const vy = (v: number) => v === 1 ? R + 2 : v === 2 ? svgH - R - 2 : cy
        // arrowhead polygon points along a directed line
        function arrowPts(x1: number, y1: number, x2: number, y2: number) {
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx*dx + dy*dy) || 1
          const ux = dx/len, uy = dy/len, px = -uy, py = ux
          return `${x2},${y2} ${x2-ux*AH+px*AH*0.6},${y2-uy*AH+py*AH*0.6} ${x2-ux*AH-px*AH*0.6},${y2-uy*AH-py*AH*0.6}`
        }
        // edges: [edgeIdx, vertexA, vertexB]
        const edgeList: [number, number, number][] = [
          [0, 1, 3], [1, 2, 3],
          ...Array.from({ length: clampedN - 3 }, (_, k): [number, number, number] => [k + 2, k + 3, k + 4])
        ]
        return (
          <div className="bg-gray-50 rounded p-2">
            <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
              {edgeList.map(([ei, a, b]) => {
                const fwd = syncedDirsD[ei] ?? true
                const src = fwd ? a : b, tgt = fwd ? b : a
                const x1 = vx(src), y1 = vy(src), x2 = vx(tgt), y2 = vy(tgt)
                const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy)||1
                const ux = dx/len, uy = dy/len
                const tx = x1+ux*R, ty = y1+uy*R
                const hx = x2-ux*R, hy = y2-uy*R
                return (
                  <g key={ei} onClick={() => toggleEdgeD(ei)} style={{ cursor: 'pointer' }}>
                    <line x1={tx} y1={ty} x2={hx} y2={hy} stroke="#6366f1" strokeWidth={1.5} />
                    <polygon points={arrowPts(tx, ty, hx, hy)} fill="#6366f1" />
                    <line x1={tx} y1={ty} x2={hx} y2={hy} stroke="transparent" strokeWidth={10} />
                  </g>
                )
              })}
              {[1, 2, ...Array.from({ length: clampedN - 2 }, (_, k) => k + 3)].map(v => (
                <g key={v}>
                  <circle cx={vx(v)} cy={vy(v)} r={R} fill="white" stroke="#6366f1" strokeWidth={1.5} />
                  <text x={vx(v)} y={vy(v)+0.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontFamily="monospace" fontWeight="700" fill="#4f46e5">{v}</text>
                </g>
              ))}
            </svg>
          </div>
        )
      })()}

      <button type="submit"
        className="mt-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors">
        Generate
      </button>
    </form>
  )
}
