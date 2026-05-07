import { useEffect, useRef } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { DARQuiver, DModule, DSES, Quiver } from '../types/mathTypes'
import { computeDnARLayout } from '../math/typeDArQuiver'

type GSNodeColor = { fill: string; stroke: string; textFill: string }

interface Props {
  dArQuiver: DARQuiver
  quiver: Quiver
  onPositions?: (x: Map<string, number>, y: Map<string, number>) => void
  selectedDSES?: DSES | null
  selectedDTilting?: DModule[] | null
  showTau?: boolean
  gsHighlight?: Map<string, GSNodeColor> | null
}

const R = 22
const ARROW_HEAD = 6

function arrowhead(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  return `${x2},${y2} ${x2 - ux * ARROW_HEAD + px * ARROW_HEAD * 0.6},${y2 - uy * ARROW_HEAD + py * ARROW_HEAD * 0.6} ${x2 - ux * ARROW_HEAD - px * ARROW_HEAD * 0.6},${y2 - uy * ARROW_HEAD - py * ARROW_HEAD * 0.6}`
}

export default function DARQuiverViewer({ dArQuiver, quiver, onPositions, selectedDSES, selectedDTilting, showTau = false, gsHighlight = null }: Props) {
  const hlNodes = new Set<string>()
  if (selectedDSES) {
    hlNodes.add(selectedDSES.left.id)
    selectedDSES.middle.forEach(m => hlNodes.add(m.id))
    hlNodes.add(selectedDSES.right.id)
  }
  const tiltingIds = selectedDTilting ? new Set(selectedDTilting.map(m => m.id)) : null
  const pos = computeDnARLayout(dArQuiver, quiver)

  useEffect(() => {
    if (!onPositions) return
    const xMap = new Map<string, number>()
    const yMap = new Map<string, number>()
    pos.forEach(({ x, y }, id) => { xMap.set(id, x); yMap.set(id, y) })
    onPositions(xMap, yMap)
  }, [dArQuiver, quiver])

  if (dArQuiver.nodes.length === 0) return null

  const xs = [...pos.values()].map(p => p.x)
  const ys = [...pos.values()].map(p => p.y)
  const minX = Math.min(...xs) - R - 10
  const minY = Math.min(...ys) - R - 70
  const maxX = Math.max(...xs) + R + 10
  const maxY = Math.max(...ys) + R + 10
  const W = maxX - minX
  const H = maxY - minY
  const PAD = 60
  const vw = W + PAD * 2
  const vh = H + PAD * 2

  const ox = -minX, oy = -minY

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
          <div style={{ padding: `${PAD}px` }}>
    <svg width={W} height={H} className="overflow-visible">
      {/* τ (translation) dashed arrows */}
      {showTau && (() => {
        const p1Node = dArQuiver.nodes.find(n => n.projVertex === 1)
        const p1Y = p1Node ? (pos.get(p1Node.id)?.y ?? null) : null
        const nodeById = new Map(dArQuiver.nodes.map(n => [n.id, n]))

        return dArQuiver.nodes
          .filter(mod => mod.generatedBy)
          .map(mod => {
            const { srcId } = mod.generatedBy!
            const sp = pos.get(mod.id), tp = pos.get(srcId)
            if (!sp || !tp) return null
            const x1 = sp.x + ox, y1 = sp.y + oy
            const x2 = tp.x + ox, y2 = tp.y + oy

            const srcNode = nodeById.get(srcId)
            const isFork = srcNode?.nodeType === 'fork'
            const isP1Layer = p1Y !== null && Math.abs(tp.y - p1Y) < 5
            const bendUp = isFork || isP1Layer

            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            const ctrlX = midX
            const ctrlY = bendUp ? Math.min(y1, y2) - 50 : midY

            const dsx = ctrlX - x1, dsy = ctrlY - y1
            const slen = Math.sqrt(dsx * dsx + dsy * dsy) || 1
            const tailX = x1 + (dsx / slen) * R
            const tailY = y1 + (dsy / slen) * R

            const dex = x2 - ctrlX, dey = y2 - ctrlY
            const elen = Math.sqrt(dex * dex + dey * dey) || 1
            const tipX = x2 - (dex / elen) * R
            const tipY = y2 - (dey / elen) * R

            return (
              <g key={`tau-${mod.id}`}>
                <path
                  d={`M ${tailX},${tailY} Q ${ctrlX},${ctrlY} ${tipX},${tipY}`}
                  fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5,3"
                />
                <polygon points={arrowhead(ctrlX, ctrlY, tipX, tipY)} fill="#9ca3af" />
              </g>
            )
          })
      })()}
      {/* Arrows */}
      {dArQuiver.arrows.map(({ sourceId, targetId }, idx) => {
        const sp = pos.get(sourceId), tp = pos.get(targetId)
        if (!sp || !tp) return null
        const x1 = sp.x + ox, y1 = sp.y + oy
        const x2 = tp.x + ox, y2 = tp.y + oy
        const dx = x2 - x1, dy = y2 - y1
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        const ux = dx / len, uy = dy / len
        const tailX = x1 + ux * R, tailY = y1 + uy * R
        const tipX = x2 - ux * R, tipY = y2 - uy * R
        return (
          <g key={idx}>
            <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="#374151" strokeWidth={1.5} />
            <polygon points={arrowhead(tailX, tailY, tipX, tipY)} fill="#374151" />
          </g>
        )
      })}
      {/* Nodes */}
      {dArQuiver.nodes.map(mod => {
        const p = pos.get(mod.id)
        if (!p) return null
        const cx = p.x + ox, cy = p.y + oy
        const lineH = 9
        const totalH = mod.layers.length * lineH
        const isSES = hlNodes.has(mod.id)
        const isTilting = tiltingIds?.has(mod.id) ?? false
        const gsColor = gsHighlight?.get(mod.id)
        const fill = gsColor ? gsColor.fill : isSES ? '#bbf7d0' : isTilting ? '#ede9fe' : 'white'
        const stroke = gsColor ? gsColor.stroke : isSES ? '#16a34a' : isTilting ? '#7c3aed' : '#6366f1'
        const strokeW = (isSES || isTilting || gsColor) ? 2.5 : 1.5
        const textFill = gsColor ? gsColor.textFill : isSES ? '#14532d' : isTilting ? '#4c1d95' : '#4f46e5'
        return (
          <g key={mod.id}>
            <circle cx={cx} cy={cy} r={R} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            {mod.layers.map((layer, i) => (
              <text key={i} x={cx} y={cy - totalH / 2 + i * lineH + lineH / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontFamily="monospace" fill={textFill} fontWeight={700}>
                {layer.join(' ')}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
          </div>
        </TransformComponent>
      </TransformWrapper>
      <div className="absolute bottom-3 right-3 text-[10px] text-gray-400 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 select-none pointer-events-none">
        scroll to zoom · drag to pan
      </div>
    </div>
  )
}
