import { useState, useRef, useCallback, useEffect } from 'react'
import type { Arrow, Quiver, ARQuiver as ARQuiverType, DARQuiver, Orientation, QuiverType, Module, DModule, Point, Rect } from './types/mathTypes'
import { buildQuiver } from './math/quiver'
import { buildDnQuiver } from './math/typeDQuiver'
import { computeDnARQuiver } from './math/typeDArQuiver'
import { computeARQuiver } from './math/arQuiver'
import { generateIndecomposables } from './math/typeAIndecomposables'
import { computeSES, computeDSES, computeDExactStructure, type SES } from './math/exactSequences'
import type { DSES } from './types/mathTypes'
import QuiverInput from './components/QuiverInput'
import ARQuiverViewer from './components/ARQuiverViewer'
import DARQuiverViewer from './components/DARQuiverViewer'
import TiltingLatticeViewer from './components/TiltingLatticeViewer'
import DTiltingLatticeViewer from './components/DTiltingLatticeViewer'

interface SimState {
  quiver: Quiver
  arQuiver: ARQuiverType
  dArQuiver?: DARQuiver
}

export type SESWithRect = SES & { rect: Rect | null }

function DNodeBadge({ layers }: { layers: number[][] }) {
  const R = 18
  const lineH = 9
  const totalH = layers.length * lineH
  return (
    <svg width={R * 2 + 2} height={R * 2 + 2} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <circle cx={R + 1} cy={R + 1} r={R} fill="white" stroke="#6366f1" strokeWidth={1.5} />
      {layers.map((layer, i) => (
        <text key={i} x={R + 1} y={R + 1 - totalH / 2 + i * lineH + lineH / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={8} fontFamily="monospace" fill="#4f46e5" fontWeight={700}>
          {layer.join(' ')}
        </text>
      ))}
    </svg>
  )
}

function computeRect(
  ses: SES,
  xPos: Map<string, number>,
  yPos: Map<string, number>,
): Rect | null {
  const pt = (id: string): Point | null => {
    const x = xPos.get(id), y = yPos.get(id)
    return x !== undefined && y !== undefined ? { x, y } : null
  }
  const A = pt(ses.left.id)
  const R = pt(ses.right.id)
  if (!A || !R) return null

  if (ses.middle.length === 1) {
    // A-B and B-C perpendicular sides; 4th corner D = A + C - B
    const B = pt(ses.middle[0].id)
    if (!B) return null
    const D: Point = { x: A.x + R.x - B.x, y: A.y + R.y - B.y }
    return [A, B, R, D]
  } else {
    // A-B⊕C-D: corners are A, B, D, C
    const B = pt(ses.middle[0].id)
    const C = pt(ses.middle[1].id)
    if (!B || !C) return null
    return [A, B, R, C]
  }
}

// Returns true if point p is inside the parallelogram defined by corners [A, B, C, D]
// Parameterisation: A + s*(B-A) + t*(D-A), 0≤s≤1, 0≤t≤1
function pointInParallelogram(p: Point, rect: Rect): boolean {
  const [A, B, , D] = rect
  const u = { x: B.x - A.x, y: B.y - A.y }
  const v = { x: D.x - A.x, y: D.y - A.y }
  const w = { x: p.x - A.x, y: p.y - A.y }
  const det = u.x * v.y - u.y * v.x
  if (Math.abs(det) < 1e-6) return false
  const s = (w.x * v.y - w.y * v.x) / det
  const t = (u.x * w.y - u.y * w.x) / det
  const eps = 1e-6
  return s >= -eps && s <= 1 + eps && t >= -eps && t <= 1 + eps
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

export default function App() {
  const [panelTopHeight, setPanelTopHeight] = useState<number | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('sidebarWidth') ?? '288', 10))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const asideRef = useRef<HTMLElement>(null)
  const topPanelRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const hDragging = useRef(false)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])


  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    if (topPanelRef.current && panelTopHeight === null) {
      setPanelTopHeight(topPanelRef.current.getBoundingClientRect().height)
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !asideRef.current) return
      const rect = asideRef.current.getBoundingClientRect()
      const newH = Math.max(120, Math.min(ev.clientY - rect.top, rect.height - 80))
      setPanelTopHeight(newH)
    }
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelTopHeight])

  const onHDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    hDragging.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      if (!hDragging.current) return
      const newW = Math.max(180, Math.min(520, startW + ev.clientX - startX))
      setSidebarWidth(newW)
      localStorage.setItem('sidebarWidth', String(newW))
    }
    const onUp = () => {
      hDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const [state, setState] = useState<SimState | null>(null)
  const [sesList, setSesList] = useState<SESWithRect[] | null>(null)
  const [showSESPanel, setShowSESPanel] = useState(false)
  const [xPositions, setXPositions] = useState<Map<string, number>>(new Map())
  const [yPositions, setYPositions] = useState<Map<string, number>>(new Map())
  const [selectedSES, setSelectedSES] = useState<SESWithRect | null>(null)
  const [tiltingList, setTiltingList] = useState<Module[][] | null>(null)
  const [selectedTilting, setSelectedTilting] = useState<Module[] | null>(null)
  const [showExactStructures, setShowExactStructures] = useState(false)
  const [selectedExactStructure, setSelectedExactStructure] = useState<number[] | null>(null)
  const [expandedStructureMask, setExpandedStructureMask] = useState<number | null>(null)
  const [hideExactOverlay, setHideExactOverlay] = useState(false)
  const [dXPositions, setDXPositions] = useState<Map<string, number>>(new Map())
  const [, setDYPositions] = useState<Map<string, number>>(new Map())
  const [dSesList, setDSesList] = useState<DSES[] | null>(null)
  const [selectedDSES, setSelectedDSES] = useState<DSES | null>(null)
  const [dShowExactStructures, setDShowExactStructures] = useState(false)
  const [dSelectedExactStructure, setDSelectedExactStructure] = useState<number[] | null>(null)
  const [dExpandedStructureMask, setDExpandedStructureMask] = useState<number | null>(null)
  const [dTiltingList, setDTiltingList] = useState<DModule[][] | null>(null)
  const [selectedDTilting, setSelectedDTilting] = useState<DModule[] | null>(null)
  const [dExtraStructureSeed, setDExtraStructureSeed] = useState(0)


  const [gsMode, setGsMode] = useState(false)
  const [gsSteps, setGsSteps] = useState<Module[][] | null>(null)
  const [selectedGSStep, setSelectedGSStep] = useState<number | null>(null)
  const [view, setView] = useState<'ar' | 'lattice' | 'dlattice'>('ar')
  const [tiltingLattice, setTiltingLattice] = useState<{ nodes: Module[][]; edges: [number, number][] } | null>(null)
  const [showExactComponents, setShowExactComponents] = useState(false)
  const [showMutationLabels, setShowMutationLabels] = useState(false)
  const [extraStructureSeed, setExtraStructureSeed] = useState(0)
  const [showTauArrows, setShowTauArrows] = useState(false)
  const [inputQuiverType, setInputQuiverType] = useState<'A' | 'D'>('A')
  const [dTiltingLattice, setDTiltingLattice] = useState<{ nodes: DModule[][]; edges: [number, number][] } | null>(null)
  const [dGsMode, setDGsMode] = useState(false)
  const [dGsSteps, setDGsSteps] = useState<DModule[][] | null>(null)
  const [selectedDGSStep, setSelectedDGSStep] = useState<number | null>(null)
  const [dShowExactComponents, setDShowExactComponents] = useState(false)

  function handleReset() {
    setState(null)
    setSesList(null); setShowSESPanel(false); setSelectedSES(null)
    setTiltingList(null); setSelectedTilting(null)
    setShowExactStructures(false); setSelectedExactStructure(null); setExpandedStructureMask(null)
    setHideExactOverlay(false)
    setDSesList(null); setSelectedDSES(null)
    setDShowExactStructures(false); setDSelectedExactStructure(null); setDExpandedStructureMask(null)
    setDTiltingList(null); setSelectedDTilting(null); setDExtraStructureSeed(0)
    setGsMode(false); setGsSteps(null); setSelectedGSStep(null)
    setView('ar'); setTiltingLattice(null)
    setShowExactComponents(false); setShowMutationLabels(false); setExtraStructureSeed(0)
    setShowTauArrows(false)
    setDTiltingLattice(null); setDGsMode(false); setDGsSteps(null); setSelectedDGSStep(null); setDShowExactComponents(false)
  }

  function handleGenerate(n: number, orientation: Orientation, quiverType: QuiverType = 'A', customArrows?: Arrow[]) {
    const quiver = quiverType === 'D' ? buildDnQuiver(n, customArrows) : buildQuiver(n, orientation, customArrows)
    const arQuiver = quiverType === 'D' ? { nodes: [], arrows: [] } : computeARQuiver(quiver)
    const dArQuiver = quiverType === 'D' ? computeDnARQuiver(quiver) : undefined
    setState({ quiver, arQuiver, dArQuiver })
    setSesList(null)
    setShowSESPanel(false)
    setSelectedSES(null)
    setDSesList(null)
    setSelectedDSES(null)
    setDShowExactStructures(false)
    setDSelectedExactStructure(null)
    setDExpandedStructureMask(null)
    setDTiltingList(null)
    setSelectedDTilting(null)
    setDExtraStructureSeed(0)
    setTiltingList(null)
    setSelectedTilting(null)
    setShowExactStructures(false)
    setSelectedExactStructure(null)
    setExpandedStructureMask(null)
    setHideExactOverlay(false)
    setGsMode(false)
    setGsSteps(null)
    setSelectedGSStep(null)
    setView('ar')
    setTiltingLattice(null)
    setShowExactComponents(false)
    setShowMutationLabels(false)
    setExtraStructureSeed(0)
    setDTiltingLattice(null); setDGsMode(false); setDGsSteps(null); setSelectedDGSStep(null); setDShowExactComponents(false)
  }

  function handleShowSES() {
    if (!state) return
    const modules = generateIndecomposables(state.quiver.n)
    const all = computeSES(modules, state.quiver.n)
    const filtered = all.filter(ses => {
      const lx = xPositions.get(ses.left.id)
      const rx = xPositions.get(ses.right.id)
      if (lx === undefined || rx === undefined) return true
      if (lx >= rx) return false
      return ses.middle.every(m => {
        const mx = xPositions.get(m.id)
        if (mx === undefined) return true
        return lx < mx && mx < rx
      })
    })
    const enriched: SESWithRect[] = filtered.map(ses => ({
      ...ses,
      rect: computeRect(ses, xPositions, yPositions),
    }))
    setSesList(enriched.sort((a, b) => {
      const axDist = Math.abs((xPositions.get(a.right.id) ?? 0) - (xPositions.get(a.left.id) ?? 0))
      const bxDist = Math.abs((xPositions.get(b.right.id) ?? 0) - (xPositions.get(b.left.id) ?? 0))
      return axDist - bxDist
    }))
    setShowSESPanel(true)
    setTiltingList(null)
  }

  function handleShowDSES() {
    if (!state?.dArQuiver) return
    const all = computeDSES(state.dArQuiver.nodes, dXPositions, state.quiver.arrows)
    setDSesList(all)
    setSelectedDSES(null)
  }

  function handleShowDTilting() {
    if (!state?.dArQuiver) return
    const modules = state.dArQuiver.nodes
    const n = state.quiver.n
    const ses = dSesList ?? computeDSES(modules, dXPositions, state.quiver.arrows)

    const incompatible = new Set<string>()
    for (const s of ses) {
      incompatible.add(`${s.left.id}|${s.right.id}`)
      incompatible.add(`${s.right.id}|${s.left.id}`)
    }

    const tilting: DModule[][] = []
    for (const subset of combinations(modules, n)) {
      let rigid = true
      outer: for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (incompatible.has(`${subset[i].id}|${subset[j].id}`)) { rigid = false; break outer }
        }
      }
      if (rigid) tilting.push(subset)
    }
    setDTiltingList(tilting)
  }

  function getActiveSES(): SESWithRect[] {
    if (!state) return []
    if (sesList) return sesList
    const modules = generateIndecomposables(state.quiver.n)
    const all = computeSES(modules, state.quiver.n)
    return all
      .filter(ses => {
        const lx = xPositions.get(ses.left.id)
        const rx = xPositions.get(ses.right.id)
        if (lx === undefined || rx === undefined) return true
        if (lx >= rx) return false
        return ses.middle.every(m => {
          const mx = xPositions.get(m.id)
          if (mx === undefined) return true
          return lx < mx && mx < rx
        })
      })
      .map(ses => ({ ...ses, rect: computeRect(ses, xPositions, yPositions) }))
  }

  function handleShowTilting() {
    if (!state) return
    const n = state.quiver.n
    const modules = generateIndecomposables(n)

    const incompatible = new Set<string>()
    for (const ses of getActiveSES()) {
      incompatible.add(`${ses.left.id}|${ses.right.id}`)
      incompatible.add(`${ses.right.id}|${ses.left.id}`)
    }

    const tilting: Module[][] = []
    for (const subset of combinations(modules, n)) {
      let rigid = true
      outer: for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (incompatible.has(`${subset[i].id}|${subset[j].id}`)) {
            rigid = false
            break outer
          }
        }
      }
      if (rigid) tilting.push(subset)
    }
    setTiltingList(tilting)
  }

  function handleGenerateLattice() {
    if (!state) return
    const n = state.quiver.n
    const modules = generateIndecomposables(n)

    const incompatible = new Set<string>()
    for (const ses of getActiveSES()) {
      incompatible.add(`${ses.left.id}|${ses.right.id}`)
      incompatible.add(`${ses.right.id}|${ses.left.id}`)
    }

    const tilting: Module[][] = []
    for (const subset of combinations(modules, n)) {
      let rigid = true
      outer: for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (incompatible.has(`${subset[i].id}|${subset[j].id}`)) { rigid = false; break outer }
        }
      }
      if (rigid) tilting.push(subset)
    }

    const edges: [number, number][] = []
    for (let i = 0; i < tilting.length; i++) {
      const setI = new Set(tilting[i].map(m => m.id))
      for (let j = i + 1; j < tilting.length; j++) {
        const diff = tilting[j].filter(m => !setI.has(m.id))
        if (diff.length === 1) edges.push([i, j])
      }
    }

    setTiltingLattice({ nodes: tilting, edges })
    setTiltingList(tilting)
    setView('lattice')
  }

  function handleComputeGS() {
    if (!selectedExactStructure || !selectedTilting || !state) return
    const sesInE = getSESInExactStructure(selectedExactStructure)
    const allModules = new Map<string, Module>()
    generateIndecomposables(state.quiver.n).forEach(m => allModules.set(m.id, m))

    const steps: Module[][] = []
    let current = new Set<string>(selectedTilting.map(m => m.id))
    const toModules = (ids: Set<string>) =>
      [...ids].map(id => allModules.get(id)!).filter(Boolean)

    steps.push(toModules(current))

    while (true) {
      const next = new Set<string>(current)
      for (const ses of sesInE) {
        if (ses.middle.every(m => current.has(m.id))) {
          next.add(ses.left.id)
          next.add(ses.right.id)
        }
      }
      if (next.size === current.size) break
      current = next
      steps.push(toModules(current))
    }
    setGsSteps(steps)
  }

  function getActiveDSES(): DSES[] {
    if (!state?.dArQuiver) return []
    if (dSesList) return dSesList
    return computeDSES(state.dArQuiver.nodes, dXPositions, state.quiver.arrows)
  }

  function getDArDSES(): DSES[] {
    return getActiveDSES().filter(ses => {
      const lx = dXPositions.get(ses.left.id), rx = dXPositions.get(ses.right.id)
      return lx !== undefined && rx !== undefined && Math.abs(rx - lx - 180) < 0.5
    })
  }

  function getSESInDExactStructure(indices: number[]): DSES[] {
    if (!state?.dArQuiver) return []
    if (indices.length === 1 && indices[0] === -1) {
      return getActiveDSES().filter(s => s.middle.length === 2)
    }
    const arDSES = getDArDSES()
    const selectedAR = indices.map(idx => arDSES[idx - 1]).filter(Boolean) as DSES[]
    const all = getActiveDSES()
    return computeDExactStructure(all, selectedAR, dXPositions, state.dArQuiver.arrows)
  }

  function handleGenerateDLattice() {
    if (!state?.dArQuiver) return
    const modules = state.dArQuiver.nodes
    const n = state.quiver.n
    const ses = getActiveDSES()

    const incompatible = new Set<string>()
    for (const s of ses) {
      incompatible.add(`${s.left.id}|${s.right.id}`)
      incompatible.add(`${s.right.id}|${s.left.id}`)
    }

    const tilting: DModule[][] = []
    for (const subset of combinations(modules, n)) {
      let rigid = true
      outer: for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (incompatible.has(`${subset[i].id}|${subset[j].id}`)) { rigid = false; break outer }
        }
      }
      if (rigid) tilting.push(subset)
    }

    const edges: [number, number][] = []
    for (let i = 0; i < tilting.length; i++) {
      const setI = new Set(tilting[i].map(m => m.id))
      for (let j = i + 1; j < tilting.length; j++) {
        const diff = tilting[j].filter(m => !setI.has(m.id))
        if (diff.length === 1) edges.push([i, j])
      }
    }

    setDTiltingLattice({ nodes: tilting, edges })
    setDTiltingList(tilting)
    setView('dlattice')
  }

  function handleComputeDGS() {
    if (!dSelectedExactStructure || !selectedDTilting || !state?.dArQuiver) return
    const sesInE = getSESInDExactStructure(dSelectedExactStructure)
    const allModules = new Map<string, DModule>()
    state.dArQuiver.nodes.forEach(m => allModules.set(m.id, m))

    const steps: DModule[][] = []
    let current = new Set<string>(selectedDTilting.map(m => m.id))
    const toModules = (ids: Set<string>) =>
      [...ids].map(id => allModules.get(id)!).filter(Boolean)

    steps.push(toModules(current))

    while (true) {
      const next = new Set<string>(current)
      for (const ses of sesInE) {
        if (ses.middle.every(m => current.has(m.id))) {
          next.add(ses.left.id)
          next.add(ses.right.id)
        }
      }
      if (next.size === current.size) break
      current = next
      steps.push(toModules(current))
    }
    setDGsSteps(steps)
    setSelectedDGSStep(null)
  }

  const q = state?.quiver

  const arSES = (sesList?.filter(ses => {
    const lx = xPositions.get(ses.left.id)
    const rx = xPositions.get(ses.right.id)
    return lx !== undefined && rx !== undefined && Math.abs(rx - lx) === 160
  }) ?? []).sort((a, b) => {
    const ax = xPositions.get(a.left.id) ?? 0
    const bx = xPositions.get(b.left.id) ?? 0
    if (ax !== bx) return ax - bx
    const ay = yPositions.get(a.left.id) ?? 0
    const by2 = yPositions.get(b.left.id) ?? 0
    return ay - by2
  })

  // AR sequence center points (badge position = avg x of endpoints, y of left)
  const arCenters: Array<{ idx: number; center: Point }> = arSES.flatMap((ses, i) => {
    const lx = xPositions.get(ses.left.id), ly = yPositions.get(ses.left.id)
    const rx = xPositions.get(ses.right.id)
    if (lx === undefined || ly === undefined || rx === undefined) return []
    return [{ idx: i + 1, center: { x: (lx + rx) / 2, y: ly } }]
  })

  function getSESInExactStructure(indices: number[]): SESWithRect[] {
    if (!sesList) return []
    const indicesSet = new Set(indices)
    return sesList.filter(ses => {
      if (!ses.rect) return false
      return arCenters.every(({ idx, center }) =>
        !pointInParallelogram(center, ses.rect!) || indicesSet.has(idx)
      )
    })
  }

  const selectedSESNumber = selectedSES ? arSES.indexOf(selectedSES) : -1

  type Badge = { label: number; leftId: string; rightId: string }
  const badges: Badge[] = selectedExactStructure != null
    ? selectedExactStructure.flatMap(idx => {
        const ses = arSES[idx - 1]
        return ses ? [{ label: idx, leftId: ses.left.id, rightId: ses.right.id }] : []
      })
    : selectedSESNumber >= 0 && selectedSES
      ? [{ label: selectedSESNumber + 1, leftId: selectedSES.left.id, rightId: selectedSES.right.id }]
      : []

  const GS_COLORS = [
    { tw: 'bg-purple-100 text-purple-800 border-purple-300', fill: '#e9d5ff', stroke: '#7c3aed', textFill: '#4c1d95' },
    { tw: 'bg-orange-100 text-orange-800 border-orange-300', fill: '#fed7aa', stroke: '#ea580c', textFill: '#7c2d12' },
    { tw: 'bg-rose-100 text-rose-800 border-rose-300',       fill: '#fecdd3', stroke: '#e11d48', textFill: '#881337' },
    { tw: 'bg-red-100 text-red-900 border-red-400',          fill: '#fca5a5', stroke: '#b91c1c', textFill: '#7f1d1d' },
  ]
  const gsColor = (i: number) => GS_COLORS[Math.min(i, GS_COLORS.length - 1)]

  // Build a map id → color for all modules up to the selected step
  type GSNodeColor = { fill: string; stroke: string; textFill: string }
  const gsHighlight: Map<string, GSNodeColor> | null =
    selectedGSStep !== null && gsSteps ? (() => {
      const map = new Map<string, GSNodeColor>()
      for (let j = 0; j <= selectedGSStep; j++) {
        const prevIds = j > 0 ? new Set(gsSteps[j - 1].map(m => m.id)) : null
        const { fill, stroke, textFill } = gsColor(j)
        for (const m of gsSteps[j]) {
          if (!prevIds || !prevIds.has(m.id)) {
            map.set(m.id, { fill, stroke, textFill })
          }
        }
      }
      return map
    })() : null

  const dGsHighlight: Map<string, GSNodeColor> | null =
    selectedDGSStep !== null && dGsSteps && selectedDGSStep < dGsSteps.length ? (() => {
      const map = new Map<string, GSNodeColor>()
      for (let j = 0; j <= selectedDGSStep; j++) {
        if (j >= dGsSteps.length) break
        const prevIds = j > 0 ? new Set(dGsSteps[j - 1].map(m => m.id)) : null
        const { fill, stroke, textFill } = gsColor(j)
        for (const m of dGsSteps[j]) {
          if (!prevIds || !prevIds.has(m.id)) {
            map.set(m.id, { fill, stroke, textFill })
          }
        }
      }
      return map
    })() : null

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <span className="text-lg font-bold text-gray-800">AR Quiver Simulator</span>
        <span className="text-xs text-gray-400">Auslander–Reiten theory</span>
        <span className="text-xs text-gray-400">by Sunny Roy – sunny.roy@usherbrooke.ca</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          ref={asideRef}
          className={`bg-white flex flex-col ${isMobile ? 'overflow-y-auto' : 'overflow-hidden'}`}
          style={isMobile ? {
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: drawerOpen ? '60vh' : 0,
            zIndex: 50,
            transition: 'height 0.25s ease',
            borderTop: '1px solid #e5e7eb',
          } : {
            width: sidebarWidth,
            flexShrink: 0,
            borderRight: '1px solid #e5e7eb',
          }}
        >
          {isMobile && (
            <div className="flex justify-center py-2 shrink-0 cursor-pointer" onClick={() => setDrawerOpen(false)}>
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
          )}
          <div ref={topPanelRef} style={panelTopHeight !== null ? { height: panelTopHeight, minHeight: 120 } : {}} className={`flex flex-col shrink-0 ${panelTopHeight !== null ? 'overflow-y-auto' : ''}`}>

          <section className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quiver</h2>
              {inputQuiverType === 'D' && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Still in construction</span>
              )}
            </div>
            <QuiverInput onGenerate={handleGenerate} onTypeChange={setInputQuiverType} onReset={handleReset} />
          </section>


          {state && (
            <section className="p-4 border-b border-gray-100 flex flex-col gap-2">
              <div>
                {state.quiver.quiverType === 'D' ? (
                  <button
                    onClick={dSesList ? () => setDSesList(null) : handleShowDSES}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {dSesList ? 'Hide S.E.S.' : 'Show S.E.S.'}
                  </button>
                ) : (
                  <button
                    onClick={() => { if (!sesList) { handleShowSES(); setShowSESPanel(true) } else setShowSESPanel(v => !v) }}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {sesList && showSESPanel ? 'Hide S.E.S.' : 'Show S.E.S.'}
                  </button>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5 px-1">List all short exact sequences of the AR quiver</p>
              </div>
              {sesList && (
                <div>
                  <button
                    onClick={() => setShowExactStructures(v => !v)}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {showExactStructures ? 'Hide Exact Structures' : 'Show Exact Structures'}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Browse and select an exact structure ε to use in other tools</p>
                </div>
              )}
              {dSesList && (
                <div>
                  <button
                    onClick={() => setDShowExactStructures(v => !v)}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {dShowExactStructures ? 'Hide Exact Structures' : 'Show Exact Structures'}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Browse and select an exact structure ε</p>
                </div>
              )}
              <div>
                {state.quiver.quiverType === 'D' ? (
                  <button
                    onClick={dTiltingList ? () => setDTiltingList(null) : handleShowDTilting}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {dTiltingList ? 'Hide Tilting' : 'Compute Tilting'}
                  </button>
                ) : (
                  <button
                    onClick={tiltingList ? () => setTiltingList(null) : handleShowTilting}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    {tiltingList ? 'Hide Tilting' : 'Compute Tilting'}
                  </button>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5 px-1">Enumerate all tilting modules</p>
              </div>
              {state?.quiver.quiverType !== 'D' && (
                <div>
                  <button
                    onClick={handleGenerateLattice}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    Tilting Lattice
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Build the mutation graph of tilting modules — then select an exact structure to highlight ε-mutations</p>
                </div>
              )}
              {state?.quiver.quiverType === 'D' && (
                <div>
                  <button
                    onClick={handleGenerateDLattice}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold py-2 px-4 rounded"
                  >
                    Tilting Lattice
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Build the mutation graph of tilting modules — then select an exact structure to highlight ε-mutations</p>
                </div>
              )}
              {state?.quiver.quiverType !== 'D' && (
                <div>
                  <button
                    onClick={() => { setGsMode(v => !v); setGsSteps(null) }}
                    className={`w-full text-sm font-semibold py-2 px-4 rounded transition-colors ${gsMode ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-orange-100 hover:bg-orange-200 text-orange-800'}`}
                  >
                    {gsMode ? 'Cancel Gen-Sub' : 'Gen-Sub'}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Apply the Gen-Sub operator: pick an exact structure and a tilting module</p>
                </div>
              )}
              {state?.quiver.quiverType === 'D' && (
                <div>
                  <button
                    onClick={() => { setDGsMode(v => !v); setDGsSteps(null) }}
                    className={`w-full text-sm font-semibold py-2 px-4 rounded transition-colors ${dGsMode ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-orange-100 hover:bg-orange-200 text-orange-800'}`}
                  >
                    {dGsMode ? 'Cancel Gen-Sub' : 'Gen-Sub'}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">Apply the Gen-Sub operator: pick an exact structure and a tilting module</p>
                </div>
              )}
            </section>
          )}

          </div>
          {/* Drag handle */}
          <div onMouseDown={onDragStart}
            className="h-1.5 bg-gray-200 hover:bg-blue-400 cursor-row-resize shrink-0 transition-colors" />
          <div className={panelTopHeight !== null ? 'flex-1 flex flex-col overflow-y-auto' : 'flex flex-col'}>

          {gsMode && (
            <section className="p-4 border-b border-gray-100 text-xs text-gray-500 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className={selectedExactStructure ? 'text-green-600 font-semibold' : ''}>
                  {selectedExactStructure ? '✓ Exact structure selected' : '1. Select an exact structure'}
                </p>
                {selectedExactStructure && (
                  <button
                    onClick={() => setHideExactOverlay(v => !v)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    {hideExactOverlay ? 'Show overlay' : 'Hide overlay'}
                  </button>
                )}
              </div>
              <p className={selectedTilting ? 'text-purple-600 font-semibold' : ''}>
                {selectedTilting ? '✓ Tilting module selected' : '2. Select a tilting module'}
              </p>
              {selectedExactStructure && selectedTilting && (
                <button
                  onClick={handleComputeGS}
                  className="mt-1 w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-1.5 px-4 rounded"
                >
                  Compute GS
                </button>
              )}
            </section>
          )}

          {dGsMode && (
            <section className="p-4 border-b border-gray-100 text-xs text-gray-500 flex flex-col gap-1">
              <p className={dSelectedExactStructure ? 'text-green-600 font-semibold' : ''}>
                {dSelectedExactStructure ? '✓ Exact structure selected' : '1. Select an exact structure'}
              </p>
              <p className={selectedDTilting ? 'text-purple-600 font-semibold' : ''}>
                {selectedDTilting ? '✓ Tilting module selected' : '2. Select a tilting module'}
              </p>
              {dSelectedExactStructure && selectedDTilting && (
                <button
                  onClick={handleComputeDGS}
                  className="mt-1 w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-1.5 px-4 rounded"
                >
                  Compute GS
                </button>
              )}
            </section>
          )}

          {gsSteps && (
            <section className="p-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                GS Iterations ({gsSteps.length - 1} step{gsSteps.length !== 2 ? 's' : ''})
              </h2>
              <div className="flex flex-col gap-1 text-xs font-mono">
                {gsSteps.map((step, i) => {
                  const isLast = i === gsSteps!.length - 1
                  const n = gsSteps!.length - 1
                  const label = isLast && n > 0 ? `GS_E(T) = GS^${n}_E(T)` : `GS^${i}_E(T)`
                  const col = gsColor(i)
                  const isSelected = selectedGSStep === i
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedGSStep(isSelected ? null : i)}
                      className={`cursor-pointer rounded border px-2 py-1 transition-colors ${isSelected ? col.tw + ' font-bold ring-2 ring-offset-1' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <span className="font-sans text-gray-400 mr-1">{label} =</span>
                      {step.map((m, j) => {
                        const firstStep = gsSteps!.findIndex(s => s.some(x => x.id === m.id))
                        const mCol = gsColor(firstStep)
                        return (
                          <span key={j} className={mCol.tw.split(' ').slice(0, 2).join(' ') + ' font-bold'}>
                            {j > 0 && <span className="text-gray-300"> ⊕ </span>}
                            {m.label}
                          </span>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {dGsSteps && (
            <section className="p-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                GS Iterations ({dGsSteps.length - 1} step{dGsSteps.length !== 2 ? 's' : ''})
              </h2>
              <div className="flex flex-col gap-1 text-xs font-mono">
                {dGsSteps.map((step, i) => {
                  const isLast = i === dGsSteps!.length - 1
                  const nSteps = dGsSteps!.length - 1
                  const label = isLast && nSteps > 0 ? `GS_E(T) = GS^${nSteps}_E(T)` : `GS^${i}_E(T)`
                  const col = gsColor(i)
                  const isSelected = selectedDGSStep === i
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDGSStep(isSelected ? null : i)}
                      className={`cursor-pointer rounded border px-2 py-1 transition-colors ${isSelected ? col.tw + ' font-bold ring-2 ring-offset-1' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <span className="font-sans text-gray-400 mr-1">{label} =</span>
                      <span className="flex items-center flex-wrap gap-0.5 inline-flex">
                        {step.map((m, j) => {
                          const firstStep = dGsSteps!.findIndex(s => s.some(x => x.id === m.id))
                          const mCol = gsColor(firstStep)
                          return (
                            <span key={j} className="flex items-center gap-0.5">
                              {j > 0 && <span className="text-gray-300">⊕</span>}
                              <span className={mCol.tw.split(' ').slice(0, 2).join(' ') + ' font-bold rounded px-0.5'}>
                                <DNodeBadge layers={m.layers} />
                              </span>
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {showExactStructures && arSES.length > 0 && (() => {
            const k = arSES.length
            const total = 1 << k
            const diamondIndices = arSES
              .map((ses, i) => ses.middle.length === 2 ? i + 1 : null)
              .filter((x): x is number => x !== null)
            const isLargeN = (q?.n ?? 0) >= 6
            let structures: number[][]
            if (isLargeN) {
              const all = Array.from({ length: k }, (_, i) => i + 1)
              // Pick 6 pseudo-random structures using the seed
              const picks: number[][] = Array.from({ length: 6 }, (_, j) => {
                let s = (extraStructureSeed * 2654435761 + j * 1234567 + 1) | 0
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
                const mask = Math.abs(s) % total
                return Array.from({ length: k }, (_, b) => mask & (1 << b) ? b + 1 : null)
                  .filter((x): x is number => x !== null)
              })
              const seen = new Set<string>()
              const dedup = (arr: number[][]) => arr.filter(x => {
                const key = x.join(',')
                if (seen.has(key)) return false
                seen.add(key); return true
              })
              structures = dedup([[], all, diamondIndices, ...picks])
            } else {
              const all: number[][] = []
              for (let mask = 0; mask < total; mask++) {
                const indices: number[] = []
                for (let b = 0; b < k; b++) if (mask & (1 << b)) indices.push(b + 1)
                all.push(indices)
              }
              const fixed = [[], Array.from({ length: k }, (_, i) => i + 1), diamondIndices]
              const fixedKeys = new Set(fixed.map(x => x.join(',')))
              structures = [...fixed, ...all.filter(x => !fixedKeys.has(x.join(',')))]
            }
            return (
              <section className="p-4 border-b border-gray-100">
                {isLargeN && (
                  <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 flex items-start gap-1.5">
                    <span>⚠</span>
                    <span>n≥6: too many exact structures to list. A random sample is shown.</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Exact Structures {isLargeN ? `(sample)` : `(${total})`}
                  </h2>
                  {isLargeN && (
                    <button
                      onClick={() => { setExtraStructureSeed(s => s + 1); setSelectedExactStructure(null) }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      Regenerate
                    </button>
                  )}
                  {selectedExactStructure && (
                    <button
                      onClick={() => setHideExactOverlay(v => !v)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      {hideExactOverlay ? 'Show overlay' : 'Hide overlay'}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-xs font-mono">
                  {structures.map((indices, i) => {
                    const mask = indices.reduce((acc, idx) => acc | (1 << (idx - 1)), 0)
                    const isMin = indices.length === 0
                    const isMax = indices.length === k
                    const isDiamond = diamondIndices.length > 0 &&
                      indices.length === diamondIndices.length &&
                      indices.every((v, j) => v === diamondIndices[j])
                    const label = isMin ? 'ε_min' : isMax ? 'ε_max' : isDiamond ? 'ε_◇' : `ε_{${indices.join(',')}}`
                    const isSelected = selectedExactStructure !== null &&
                      selectedExactStructure.length === indices.length &&
                      selectedExactStructure.every((v, j) => v === indices[j])
                    const isExpanded = expandedStructureMask === mask
                    const sesInStructure = isExpanded ? getSESInExactStructure(indices) : []
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-1">
                          <div
                            onClick={() => {
                              setSelectedSES(null)
                              setSelectedExactStructure(isSelected ? null : indices)
                            }}
                            className={`flex-1 cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? 'bg-sky-100 text-sky-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                          >
                            {label}
                          </div>
                          <button
                            onClick={() => setExpandedStructureMask(isExpanded ? null : mask)}
                            className="text-gray-400 hover:text-gray-600 px-1"
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="ml-3 mt-0.5 mb-1 flex flex-col gap-0.5 text-[10px] font-mono text-gray-500 border-l border-gray-200 pl-2">
                            {sesInStructure.length === 0
                              ? <span className="italic">none</span>
                              : sesInStructure.map((ses, j) => {
                                  const isSelected = selectedSES === ses
                                  return (
                                    <div
                                      key={j}
                                      onClick={() => setSelectedSES(isSelected ? null : ses)}
                                      className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? 'bg-green-100 text-green-800 font-bold' : 'hover:bg-gray-100'}`}
                                    >
                                      0 → {ses.left.label} → {ses.middle.map(m => m.label).join(' ⊕ ')} → {ses.right.label} → 0
                                    </div>
                                  )
                                })
                            }
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {tiltingList && (
            <section className="p-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Tilting Modules ({tiltingList.length})
              </h2>
              <div className="flex flex-col gap-1 text-xs font-mono">
                {tiltingList.map((t, i) => {
                  const isSelected = selectedTilting === t
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedTilting(isSelected ? null : t)}
                      className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? 'bg-purple-100 text-purple-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {t.map(m => m.label).join(' ⊕ ')}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {dTiltingList && state?.quiver.quiverType === 'D' && (
            <section className="p-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Tilting Modules ({dTiltingList.length})
              </h2>
              <div className="flex flex-col gap-1 text-xs font-mono">
                {dTiltingList.map((t, i) => {
                  const isSelected = selectedDTilting === t
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDTilting(isSelected ? null : t)}
                      className={`cursor-pointer rounded px-1 py-1 transition-colors flex items-center flex-wrap gap-1 ${isSelected ? 'bg-purple-100 text-purple-800 font-bold ring-1 ring-purple-400' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {t.map((m, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-gray-300">⊕</span>}
                          <DNodeBadge layers={m.layers} />
                        </span>
                      ))}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {dShowExactStructures && dSesList && state?.quiver.quiverType === 'D' && (() => {
            const arDSES = dSesList.filter(ses => {
              const lx = dXPositions.get(ses.left.id), rx = dXPositions.get(ses.right.id)
              return lx !== undefined && rx !== undefined && Math.abs(rx - lx - 180) < 0.5
            })
            const k = arDSES.length
            const total = 1 << k
            const isLargeN = (q?.n ?? 0) >= 5
            // dihedral = AR SES with 2 or 3 middle terms
            const dihedralIndices = arDSES
              .map((ses, i) => ses.middle.length >= 2 ? i + 1 : null)
              .filter((x): x is number => x !== null)
            type StructItem = number[] | 'diamond'
            let items: StructItem[]
            if (isLargeN) {
              const all = Array.from({ length: k }, (_, i) => i + 1)
              const picks: number[][] = Array.from({ length: 6 }, (_, j) => {
                let s = (dExtraStructureSeed * 2654435761 + j * 1234567 + 1) | 0
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
                const mask = Math.abs(s) % total
                return Array.from({ length: k }, (_, b) => mask & (1 << b) ? b + 1 : null)
                  .filter((x): x is number => x !== null)
              })
              const seen = new Set<string>()
              const dedup = (arr: number[][]) => arr.filter(x => {
                const key = x.join(',')
                if (seen.has(key)) return false
                seen.add(key); return true
              })
              const reg = dedup([[], all, dihedralIndices, ...picks])
              items = [...reg.slice(0, 3), 'diamond', ...reg.slice(3)]
            } else {
              const allStructures: number[][] = []
              for (let mask = 0; mask < total; mask++) {
                const indices: number[] = []
                for (let b = 0; b < k; b++) if (mask & (1 << b)) indices.push(b + 1)
                allStructures.push(indices)
              }
              const fixed = [[], Array.from({ length: k }, (_, i) => i + 1), dihedralIndices]
              const fixedKeys = new Set(fixed.map(x => x.join(',')))
              const reg = [...fixed, ...allStructures.filter(x => !fixedKeys.has(x.join(',')))]
              items = [...reg.slice(0, 3), 'diamond', ...reg.slice(3)]
            }
            const diamondSES = dSesList!.filter(s => s.middle.length === 2)
            const DIAMOND_MASK = -1
            return (
              <section className="p-4 border-b border-gray-100">
                {isLargeN && (
                  <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 flex items-start gap-1.5">
                    <span>⚠</span>
                    <span>n≥5: too many exact structures to list. A random sample is shown.</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Exact Structures {isLargeN ? `(sample)` : `(${total})`}
                </h2>
                {isLargeN && (
                  <button
                    onClick={() => { setDExtraStructureSeed(s => s + 1); setDSelectedExactStructure(null) }}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    Regenerate
                  </button>
                )}
                </div>
                <div className="flex flex-col gap-1 text-xs font-mono">
                  {items.map((item, i) => {
                    if (item === 'diamond') {
                      const isExpanded = dExpandedStructureMask === DIAMOND_MASK
                      const isDiamondSelected = dSelectedExactStructure !== null && dSelectedExactStructure.length === 1 && dSelectedExactStructure[0] === -1
                      return (
                        <div key="diamond">
                          <div className="flex items-center gap-1">
                            <div
                              onClick={() => { setSelectedDSES(null); setDSelectedExactStructure(isDiamondSelected ? null : [-1]) }}
                              className={`flex-1 flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 transition-colors ${isDiamondSelected ? 'bg-sky-100 text-sky-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                              <span>ε_◇</span>
                              <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 font-sans font-normal">not an exact structure</span>
                              <span className="text-gray-400 font-normal">({diamondSES.length} ses)</span>
                            </div>
                            <button onClick={() => setDExpandedStructureMask(isExpanded ? null : DIAMOND_MASK)} className="text-gray-400 hover:text-gray-600 px-1">
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="ml-3 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
                              {diamondSES.length === 0
                                ? <span className="italic text-[10px] text-gray-400">none</span>
                                : diamondSES.map((ses, j) => {
                                    const isSel = selectedDSES === ses
                                    return (
                                      <div key={j} onClick={() => setSelectedDSES(isSel ? null : ses)}
                                        className={`cursor-pointer rounded px-1 py-1 flex items-center flex-wrap gap-1 ${isSel ? 'bg-green-100 ring-1 ring-green-400' : 'hover:bg-gray-100'}`}>
                                        <span className="text-[10px] text-gray-400">0→</span>
                                        <DNodeBadge layers={ses.left.layers} />
                                        <span className="text-[10px] text-gray-400">→</span>
                                        {ses.middle.map((m, mi) => (
                                          <span key={mi} className="flex items-center gap-1">
                                            {mi > 0 && <span className="text-[10px] text-gray-400">⊕</span>}
                                            <DNodeBadge layers={m.layers} />
                                          </span>
                                        ))}
                                        <span className="text-[10px] text-gray-400">→</span>
                                        <DNodeBadge layers={ses.right.layers} />
                                        <span className="text-[10px] text-gray-400">→0</span>
                                      </div>
                                    )
                                  })}
                            </div>
                          )}
                        </div>
                      )
                    }
                    const indices = item
                    const mask = indices.reduce((acc, idx) => acc | (1 << (idx - 1)), 0)
                    const isMin = indices.length === 0
                    const isMax = indices.length === k
                    const isDihedral = dihedralIndices.length > 0 &&
                      indices.length === dihedralIndices.length &&
                      indices.every((v, j) => v === dihedralIndices[j])
                    const label = isMin ? 'ε_min' : isMax ? 'ε_max' : isDihedral ? 'ε_dihedral' : `ε_{${indices.join(',')}}`
                    const isSelected = dSelectedExactStructure !== null &&
                      dSelectedExactStructure.length === indices.length &&
                      dSelectedExactStructure.every((v, j) => v === indices[j])
                    const isExpanded = dExpandedStructureMask === mask
                    const selectedAR = indices.map(idx => arDSES[idx - 1]).filter(Boolean) as typeof arDSES
                    const sesCount = state?.dArQuiver
                      ? computeDExactStructure(dSesList!, selectedAR, dXPositions, state.dArQuiver.arrows).length
                      : selectedAR.length
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-1">
                          <div
                            onClick={() => { setSelectedDSES(null); setDSelectedExactStructure(isSelected ? null : indices) }}
                            className={`flex-1 cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? 'bg-sky-100 text-sky-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                          >
                            {label} <span className="text-gray-400 font-normal">({sesCount} ses)</span>
                          </div>
                          <button onClick={() => setDExpandedStructureMask(isExpanded ? null : mask)} className="text-gray-400 hover:text-gray-600 px-1">
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                        {isExpanded && (() => {
                          const selectedAR = indices.map(idx => arDSES[idx - 1]).filter(Boolean) as typeof arDSES
                          const sesInStructure = state?.dArQuiver
                            ? computeDExactStructure(dSesList!, selectedAR, dXPositions, state.dArQuiver.arrows)
                            : selectedAR
                          return (
                            <div className="ml-3 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
                              {sesInStructure.length === 0
                                ? <span className="italic text-[10px] text-gray-400">none</span>
                                : sesInStructure.map((ses, j) => {
                                    const isSel = selectedDSES === ses
                                    return (
                                      <div key={j} onClick={() => setSelectedDSES(isSel ? null : ses)}
                                        className={`cursor-pointer rounded px-1 py-1 flex items-center flex-wrap gap-1 ${isSel ? 'bg-green-100 ring-1 ring-green-400' : 'hover:bg-gray-100'}`}>
                                        <span className="text-[10px] text-gray-400">0→</span>
                                        <DNodeBadge layers={ses.left.layers} />
                                        <span className="text-[10px] text-gray-400">→</span>
                                        {ses.middle.map((m, mi) => (
                                          <span key={mi} className="flex items-center gap-1">
                                            {mi > 0 && <span className="text-[10px] text-gray-400">⊕</span>}
                                            <DNodeBadge layers={m.layers} />
                                          </span>
                                        ))}
                                        <span className="text-[10px] text-gray-400">→</span>
                                        <DNodeBadge layers={ses.right.layers} />
                                        <span className="text-[10px] text-gray-400">→0</span>
                                      </div>
                                    )
                                  })}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {dSesList && state?.quiver.quiverType === 'D' && (() => {
            const arDSES = dSesList.filter(ses => {
              const lx = dXPositions.get(ses.left.id), rx = dXPositions.get(ses.right.id)
              return lx !== undefined && rx !== undefined && Math.abs(rx - lx - 180) < 0.5
            })
            const otherDSES = dSesList.filter(ses => !arDSES.includes(ses))
            const renderDList = (list: DSES[], numbered = false) => list.map((ses, i) => {
              const isSel = selectedDSES === ses
              return (
                <div key={i} onClick={() => setSelectedDSES(isSel ? null : ses)}
                  className={`cursor-pointer rounded px-1 py-1 transition-colors flex items-center flex-wrap gap-1 ${isSel ? 'bg-green-100 ring-1 ring-green-400' : 'hover:bg-gray-100'}`}>
                  {numbered && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold shrink-0">
                      {i + 1}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">0→</span>
                  <DNodeBadge layers={ses.left.layers} />
                  <span className="text-xs text-gray-400">→</span>
                  {ses.middle.map((m, j) => (
                    <span key={j} className="flex items-center gap-1">
                      {j > 0 && <span className="text-xs text-gray-400">⊕</span>}
                      <DNodeBadge layers={m.layers} />
                    </span>
                  ))}
                  <span className="text-xs text-gray-400">→</span>
                  <DNodeBadge layers={ses.right.layers} />
                  <span className="text-xs text-gray-400">→0</span>
                </div>
              )
            })
            return (
              <section className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                {arDSES.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AR Sequences ({arDSES.length})</h2>
                    <div className="flex flex-col gap-1">{renderDList(arDSES, true)}</div>
                  </div>
                )}
                {otherDSES.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Other S.E.S. ({otherDSES.length})</h2>
                    <div className="flex flex-col gap-1">{renderDList(otherDSES)}</div>
                  </div>
                )}
              </section>
            )
          })()}

          {sesList && showSESPanel && (() => {
            const otherSES = sesList.filter(ses => !arSES.includes(ses))
            const renderList = (list: SESWithRect[], numbered = false) => list.map((ses, i) => {
              const isSelected = selectedSES === ses
              return (
                <div
                  key={i}
                  onClick={() => setSelectedSES(isSelected ? null : ses)}
                  className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? 'bg-green-100 text-green-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {numbered && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold mr-1.5 shrink-0 align-middle">
                      {i + 1}
                    </span>
                  )}
                  0 → {ses.left.label} → {ses.middle.map(m => m.label).join(' ⊕ ')} → {ses.right.label} → 0
                </div>
              )
            })
            return (
              <section className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                {arSES.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      AR Sequences ({arSES.length})
                    </h2>
                    <div className="flex flex-col gap-1 text-xs font-mono">{renderList(arSES, true)}</div>
                  </div>
                )}
                {otherSES.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Other S.E.S. ({otherSES.length})
                    </h2>
                    <div className="flex flex-col gap-1 text-xs font-mono">{renderList(otherSES)}</div>
                  </div>
                )}
              </section>
            )
          })()}

          {!state && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-4 text-center">
              Enter n and click Generate to get started.
            </div>
          )}
          </div>
        </aside>

        {!isMobile && (
          <div
            className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors"
            onMouseDown={onHDragStart}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          {state && q ? (
            <>
              <div className="px-4 py-2 bg-white border-b border-gray-200 shrink-0 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1 flex items-center gap-2 min-w-0 overflow-hidden">
                  <span className="truncate shrink hidden md:inline">
                    {view === 'ar'
                      ? `Auslander–Reiten Quiver — ${q.quiverType}_${q.n} (${q.orientation})`
                      : view === 'lattice'
                      ? `Tilting Lattice — A_${q.n} (${tiltingLattice?.nodes.length ?? 0} tilting modules)`
                      : `Tilting Lattice — D_${q.n} (${dTiltingLattice?.nodes.length ?? 0} tilting modules)`}
                  </span>
                  <span className="truncate shrink md:hidden">
                    {view === 'ar'
                      ? `AR — ${q.quiverType}_${q.n}`
                      : view === 'lattice'
                      ? `Tilting A_${q.n}`
                      : `Tilting D_${q.n}`}
                  </span>
                  {view === 'ar' && (
                    <button
                      onClick={() => setShowTauArrows(v => !v)}
                      className={`text-xs px-2 py-0.5 rounded border font-normal normal-case tracking-normal transition-colors ${showTauArrows ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                    >{showTauArrows ? 'Hide' : 'Show'} AR translation</button>
                  )}
                </span>
                {view === 'lattice' && (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#dc2626] bg-[#fee2e2]" />
                      All-projectives
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#ca8a04] bg-[#fef9c3]" />
                      All-injectives
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#7c3aed] bg-[#f5f3ff]" />
                      Selected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-8 h-0.5 bg-[#16a34a] rounded" />
                      {selectedExactStructure
                        ? (() => {
                            const k = arSES.length
                            const isMin = selectedExactStructure.length === 0
                            const isMax = selectedExactStructure.length === k
                            const diamondIndices = arSES.map((s, i) => s.middle.length === 2 ? i + 1 : null).filter((x): x is number => x !== null)
                            const isDiamond = diamondIndices.length > 0 && selectedExactStructure.length === diamondIndices.length && selectedExactStructure.every((v, j) => v === diamondIndices[j])
                            const label = isMin ? 'ε_min' : isMax ? 'ε_max' : isDiamond ? 'ε_◇' : `ε_{${selectedExactStructure.join(',')}}`
                            return `${label}-mutations`
                          })()
                        : <span className="italic text-gray-400">Select an exact structure in the panel to highlight mutations</span>}
                    </span>
                  </span>
                )}
                {view === 'dlattice' && (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#dc2626] bg-[#fee2e2]" />
                      All-projectives
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#ca8a04] bg-[#fef9c3]" />
                      All-injectives
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded border-2 border-[#7c3aed] bg-[#f5f3ff]" />
                      Selected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-8 h-0.5 bg-[#16a34a] rounded" />
                      {dSelectedExactStructure
                        ? (() => {
                            if (dSelectedExactStructure.length === 1 && dSelectedExactStructure[0] === -1)
                              return 'ε_◇-mutations'
                            const arDSES = getDArDSES()
                            const k = arDSES.length
                            const dihedralIndices = arDSES.map((s, i) => s.middle.length >= 2 ? i + 1 : null).filter((x): x is number => x !== null)
                            const isMin = dSelectedExactStructure.length === 0
                            const isMax = dSelectedExactStructure.length === k
                            const isDihedral = dihedralIndices.length > 0 && dSelectedExactStructure.length === dihedralIndices.length && dSelectedExactStructure.every((v, j) => v === dihedralIndices[j])
                            const label = isMin ? 'ε_min' : isMax ? 'ε_max' : isDihedral ? 'ε_dihedral' : `ε_{${dSelectedExactStructure.join(',')}}`
                            return `${label}-mutations`
                          })()
                        : <span className="italic text-gray-400">Select an exact structure in the panel to highlight mutations</span>}
                    </span>
                  </span>
                )}
                {(tiltingLattice || dTiltingLattice) && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setView('ar')}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${view === 'ar' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                    >AR Quiver</button>
                    {tiltingLattice && (
                      <button
                        onClick={() => setView('lattice')}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${view === 'lattice' ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                      >Tilting Lattice</button>
                    )}
                    {dTiltingLattice && (
                      <button
                        onClick={() => setView('dlattice')}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${view === 'dlattice' ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                      >Tilting Lattice</button>
                    )}
                  </div>
                )}
                </div>
                {view === 'lattice' && selectedExactStructure && tiltingLattice && (() => {
                  const sesPairs = getSESInExactStructure(selectedExactStructure).map(s => ({ leftId: s.left.id, rightId: s.right.id }))
                  const parent = Array.from({ length: tiltingLattice.nodes.length }, (_, i) => i)
                  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
                  for (const [a, b] of tiltingLattice.edges) {
                    const setA = new Set(tiltingLattice.nodes[a].map(m => m.id))
                    const setB = new Set(tiltingLattice.nodes[b].map(m => m.id))
                    const xId = tiltingLattice.nodes[a].find(m => !setB.has(m.id))?.id
                    const yId = tiltingLattice.nodes[b].find(m => !setA.has(m.id))?.id
                    if (xId && yId && sesPairs.some(s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)))
                      parent[find(a)] = find(b)
                  }
                  const numComponents = new Set(Array.from({ length: tiltingLattice.nodes.length }, (_, i) => find(i))).size
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowExactComponents(v => !v)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${showExactComponents ? 'bg-pink-100 border-pink-400 text-pink-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                      >
                        {showExactComponents ? 'Hide' : 'Show'} components
                      </button>
                      {showExactComponents && <span className="text-xs text-gray-500">{numComponents} component{numComponents !== 1 ? 's' : ''}</span>}
                      <button
                        onClick={() => setShowMutationLabels(v => !v)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${showMutationLabels ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                      >
                        {showMutationLabels ? 'Hide' : 'Show'} mutation labels
                      </button>
                    </div>
                  )
                })()}
                {view === 'dlattice' && dSelectedExactStructure && dTiltingLattice && (() => {
                  const sesPairs = getSESInDExactStructure(dSelectedExactStructure).map(s => ({ leftId: s.left.id, rightId: s.right.id }))
                  const parent = Array.from({ length: dTiltingLattice.nodes.length }, (_, i) => i)
                  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
                  for (const [a, b] of dTiltingLattice.edges) {
                    const setA = new Set(dTiltingLattice.nodes[a].map(m => m.id))
                    const setB = new Set(dTiltingLattice.nodes[b].map(m => m.id))
                    const xId = dTiltingLattice.nodes[a].find(m => !setB.has(m.id))?.id
                    const yId = dTiltingLattice.nodes[b].find(m => !setA.has(m.id))?.id
                    if (xId && yId && sesPairs.some(s => (s.leftId === xId && s.rightId === yId) || (s.leftId === yId && s.rightId === xId)))
                      parent[find(a)] = find(b)
                  }
                  const numComponents = new Set(Array.from({ length: dTiltingLattice.nodes.length }, (_, i) => find(i))).size
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDShowExactComponents(v => !v)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${dShowExactComponents ? 'bg-pink-100 border-pink-400 text-pink-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                      >
                        {dShowExactComponents ? 'Hide' : 'Show'} components
                      </button>
                      {dShowExactComponents && <span className="text-xs text-gray-500">{numComponents} component{numComponents !== 1 ? 's' : ''}</span>}
                    </div>
                  )
                })()}
              </div>
              <div className="flex-1 overflow-hidden relative">
                {view === 'ar' && q.quiverType === 'D' && state.dArQuiver
                  ? <DARQuiverViewer dArQuiver={state.dArQuiver} quiver={q}
                      onPositions={(x, y) => { setDXPositions(x); setDYPositions(y) }}
                      selectedDSES={selectedDSES} selectedDTilting={selectedDTilting} showTau={showTauArrows}
                      gsHighlight={dGsHighlight} />
                  : view === 'ar'
                  ? <ARQuiverViewer arQuiver={state.arQuiver} quiver={q} onPositions={setXPositions} onYPositions={setYPositions} selectedSES={selectedSES} badges={hideExactOverlay ? [] : badges} selectedTilting={selectedTilting} gsHighlight={gsHighlight} showTauArrows={showTauArrows} sesRects={hideExactOverlay ? [] : (
                      selectedExactStructure != null
                        ? selectedExactStructure.flatMap(idx => { const r = arSES[idx - 1]?.rect; return r ? [r] : [] })
                        : selectedSES?.rect ? [selectedSES.rect] : []
                    )} />
                  : view === 'dlattice' && dTiltingLattice && state.dArQuiver
                  ? <DTiltingLatticeViewer
                      nodes={dTiltingLattice.nodes} edges={dTiltingLattice.edges}
                      dArQuiver={state.dArQuiver} quiver={q}
                      selectedTilting={selectedDTilting} onSelectTilting={setSelectedDTilting}
                      exactSESPairs={dSelectedExactStructure ? getSESInDExactStructure(dSelectedExactStructure).map(s => ({ leftId: s.left.id, rightId: s.right.id })) : []}
                      showExactComponents={dShowExactComponents}
                      gsHighlight={dGsHighlight}
                    />
                  : tiltingLattice
                    ? <TiltingLatticeViewer nodes={tiltingLattice.nodes} edges={tiltingLattice.edges} arQuiver={state.arQuiver} quiver={q} selectedTilting={selectedTilting} onSelectTilting={setSelectedTilting}
                        exactSESPairs={(selectedExactStructure ? getSESInExactStructure(selectedExactStructure) : []).map(ses => ({ leftId: ses.left.id, rightId: ses.right.id, labels: [] }))}
                        allSESPairs={getActiveSES().map(ses => {
                          const rect = computeRect(ses, xPositions, yPositions)
                          const labels = rect
                            ? arSES.map((ar, i) => {
                                const lx = xPositions.get(ar.left.id), rx = xPositions.get(ar.right.id), ly = yPositions.get(ar.left.id)
                                if (lx == null || rx == null || ly == null) return null
                                return pointInParallelogram({ x: (lx + rx) / 2, y: ly }, rect) ? i + 1 : null
                              }).filter((x): x is number => x !== null)
                            : []
                          return { leftId: ses.left.id, rightId: ses.right.id, labels }
                        })}
                        showExactComponents={showExactComponents} showMutationLabels={showMutationLabels}
                        exactStructureARSES={selectedExactStructure?.flatMap(idx => { const s = arSES[idx - 1]; return s ? [{ leftId: s.left.id, middleIds: s.middle.map(m => m.id), rightId: s.right.id, label: idx }] : [] }) ?? []}
                        allARSES={arSES.map((s, i) => ({ leftId: s.left.id, middleIds: s.middle.map(m => m.id), rightId: s.right.id, label: i + 1 }))} />
                    : null
                }
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              The AR quiver will appear here.
            </div>
          )}
        </main>
      </div>

      {isMobile && (
        <>
          {drawerOpen && (
            <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDrawerOpen(false)} />
          )}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className="fixed bottom-5 left-4 z-50 bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-semibold shadow-lg"
          >
            {drawerOpen ? '✕ Close' : '☰ Panel'}
          </button>
        </>
      )}
    </div>
  )
}
