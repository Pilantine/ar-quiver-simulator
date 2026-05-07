// Core mathematical types for the AR Quiver Simulator

export type Orientation = 'linear' | 'opposite' | 'custom'

export interface Arrow {
  source: number
  target: number
}

export type QuiverType = 'A' | 'D'

export interface Quiver {
  n: number
  vertices: number[]
  arrows: Arrow[]
  orientation: Orientation
  quiverType: QuiverType
}

// An indecomposable module M(i,j) for type A_n: supported on the interval [i,j]
export interface Module {
  i: number     // left endpoint (1-indexed)
  j: number     // right endpoint (1-indexed)
  id: string    // canonical key "i_j"
  label: string // display label "[i,j]"
}

export interface ARArrow {
  sourceId: string
  targetId: string
}

export interface ARQuiver {
  nodes: Module[]
  arrows: ARArrow[]
}

// Type D indecomposable module represented by its dimension vector
export type NodeType = 'edge' | 'middle' | 'fork'

export interface DModule {
  dimVec: number[]        // length n, dimVec[v-1] = multiplicity at vertex v
  id: string              // canonical key: dimVec joined by '_'
  layers: number[][]      // vertices grouped by BFS depth from projective root (for display)
  nodeType: NodeType
  projVertex?: number     // set for projective nodes: which vertex v this is P(v)
  generatedBy?: { srcId: string; tgtId: string }  // for non-projectives: the (source, target) pair that created this node
}

export interface DARQuiver {
  nodes: DModule[]
  arrows: ARArrow[]
}

export interface DSES {
  left: DModule
  middle: DModule[]  // 1, 2, or 3 terms
  right: DModule
}

// React Flow node position (computed by layout algorithm)
export interface NodePosition {
  x: number
  y: number
}

// Classification flags for a module in a given quiver
export interface ModuleFlags {
  isProjective: boolean
  isInjective: boolean
}

export type Point = { x: number; y: number }
// Four corners of a parallelogram [A, B, C, D] going around
export type Rect = [Point, Point, Point, Point]
