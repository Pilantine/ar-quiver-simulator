import type { Quiver } from '../types/mathTypes'

interface Props {
  quiver: Quiver
  forkOnRight?: boolean
}

const R = 16
const GAP = 72
const ARROW_HEAD = 6

function arrowhead(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  const tipX = x2, tipY = y2
  return `${tipX},${tipY} ${tipX - ux * ARROW_HEAD + px * ARROW_HEAD * 0.6},${tipY - uy * ARROW_HEAD + py * ARROW_HEAD * 0.6} ${tipX - ux * ARROW_HEAD - px * ARROW_HEAD * 0.6},${tipY - uy * ARROW_HEAD - py * ARROW_HEAD * 0.6}`
}

// BFS from vertex v following Q arrows → layers of reachable vertices grouped by distance
function projectiveLayers(v: number, qArrows: { source: number; target: number }[]): number[][] {
  const dist = new Map<number, number>([[v, 0]])
  const queue = [v]
  while (queue.length > 0) {
    const curr = queue.shift()!
    for (const a of qArrows) {
      if (a.source === curr && !dist.has(a.target)) {
        dist.set(a.target, dist.get(curr)! + 1)
        queue.push(a.target)
      }
    }
  }
  const maxDist = Math.max(...dist.values())
  return Array.from({ length: maxDist + 1 }, (_, d) =>
    [...dist.entries()].filter(([, dd]) => dd === d).map(([u]) => u).sort((a, b) => a - b)
  )
}

export default function QuiverViewer({ quiver, forkOnRight = false }: Props) {
  const { vertices, arrows, quiverType } = quiver

  if (quiverType === 'D') {
    const n = quiver.n
    const R_AR = 20  // slightly larger nodes in AR display to fit dim vector labels
    const NODE_R = forkOnRight ? R_AR : R
    const FORK_Y = 56
    const cy = FORK_Y + NODE_R + 8        // y of the fork junction (v=3) and v=1
    const stepY = cy - NODE_R - 4     // vertical step per chain vertex
    const svgH = forkOnRight
      ? cy + (n - 3) * stepY + NODE_R + 8
      : 2 * FORK_Y + 2 * NODE_R + 8


    // Base fork positions (right of vertex 3)
    const axis3 = forkOnRight ? (n - 3) * GAP + NODE_R + 4 : (1) * GAP + NODE_R + 4

    // Fork: reflect vertex 1 or 2 to the left of 3 if Q^op arrow points INTO 3
    const reflectV1 = forkOnRight && arrows.some(a => a.source === 1 && a.target === 3)
    const reflectV2 = forkOnRight && arrows.some(a => a.source === 2 && a.target === 3)
    const forkBaseX = forkOnRight ? (n - 2) * GAP + NODE_R + 4 : NODE_R + 4

    // Projective layers (for forkOnRight labels): BFS from v following Q arrows, grouped by depth
    const qArrows = forkOnRight ? arrows.map(a => ({ source: a.target, target: a.source })) : []
    const projLayers = forkOnRight
      ? new Map(vertices.map(v => [v, projectiveLayers(v, qArrows)]))
      : new Map<number, number[][]>()

    // Tail: build x positions per-vertex from 3 outward based on Q^op arrow direction
    // exiting from v-1 to v → v is RIGHT of v-1; entering v from v-1 (v→v-1) → v is LEFT of v-1
    const chainX = new Map<number, number>([[3, axis3]])
    if (forkOnRight) {
      for (let v = 4; v <= n; v++) {
        const prev = chainX.get(v - 1)!
        const exitingFromPrev = arrows.some(a => a.source === v - 1 && a.target === v)
        chainX.set(v, exitingFromPrev ? prev + GAP : prev - GAP)
      }
    }

    const vx = (v: number) => {
      if (!forkOnRight) return v === 1 || v === 2 ? NODE_R + 4 : (v - 2) * GAP + NODE_R + 4
      if (v === 1) return reflectV1 ? 2 * axis3 - forkBaseX : forkBaseX
      if (v === 2) return reflectV2 ? 2 * axis3 - forkBaseX : forkBaseX
      return chainX.get(v) ?? axis3
    }

    const allVx = vertices.map(vx)
    const computedSvgW = Math.max(60, Math.max(...allVx) + NODE_R + 4)

    const vy = (v: number) => {
      if (!forkOnRight) return v === 1 ? FORK_Y / 2 + NODE_R : v === 2 ? svgH - FORK_Y / 2 - NODE_R : svgH / 2
      if (v === 2) return NODE_R + 4
      if (v === 1) return cy
      return cy + (v - 3) * stepY
    }

    return (
      <svg width={computedSvgW} height={svgH} className="overflow-visible">
        {arrows.map(({ source, target }, idx) => {
          const x1 = vx(source), y1 = vy(source)
          const x2 = vx(target), y2 = vy(target)
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          const ux = dx / len, uy = dy / len
          const tailX = x1 + ux * NODE_R, tailY = y1 + uy * NODE_R
          const tipX = x2 - ux * NODE_R, tipY = y2 - uy * NODE_R
          return (
            <g key={idx}>
              <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="#374151" strokeWidth={1.5} />
              <polygon points={arrowhead(tailX, tailY, tipX, tipY)} fill="#374151" />
            </g>
          )
        })}
        {vertices.map(v => {
          const cx = vx(v), cy2 = vy(v)
          const layers = projLayers.get(v) ?? [[v]]
          const lineH = 9
          const totalH = layers.length * lineH
          return (
            <g key={v}>
              <circle cx={cx} cy={cy2} r={NODE_R} fill="white" stroke="#6366f1" strokeWidth={1.5} />
              {forkOnRight
                ? layers.map((layer, i) => (
                    <text key={i} x={cx} y={cy2 - totalH / 2 + i * lineH + lineH / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fontFamily="monospace" fill="#4f46e5" fontWeight={700}>
                      {layer.join(' ')}
                    </text>
                  ))
                : <text x={cx} y={cy2 + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize={12} fontFamily="monospace" fill="#4f46e5" fontWeight={600}>{v}</text>
              }
            </g>
          )
        })}
      </svg>
    )
  }

  // Type A: linear layout
  const { n } = quiver
  const svgW = Math.max(60, (n - 1) * GAP + 2 * R + 8)
  const SVG_H = 60
  const cx = (v: number) => (v - 1) * GAP + R + 4
  const cy = SVG_H / 2

  return (
    <svg width={svgW} height={SVG_H} className="overflow-visible">
      {arrows.map(({ source, target }, idx) => {
        const x1 = cx(source), x2 = cx(target)
        const dir = x2 > x1 ? 1 : -1
        const tipX = x2 - dir * R, tipY = cy
        const tailX = x1 + dir * R, tailY = cy
        const ah1x = tipX - dir * ARROW_HEAD, ah1y = tipY - ARROW_HEAD
        const ah2x = tipX - dir * ARROW_HEAD, ah2y = tipY + ARROW_HEAD
        return (
          <g key={idx}>
            <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="#374151" strokeWidth={1.5} />
            <polygon points={`${tipX},${tipY} ${ah1x},${ah1y} ${ah2x},${ah2y}`} fill="#374151" />
          </g>
        )
      })}
      {vertices.map(v => (
        <g key={v}>
          <circle cx={cx(v)} cy={cy} r={R} fill="white" stroke="#6366f1" strokeWidth={1.5} />
          <text x={cx(v)} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={12} fontFamily="monospace" fill="#4f46e5" fontWeight={600}>{v}</text>
        </g>
      ))}
    </svg>
  )
}
