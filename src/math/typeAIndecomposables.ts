import type { Module } from '../types/mathTypes'
import { makeModule } from './utils'

// All indecomposable kQ-modules for type A_n are intervals [i,j], 1 ≤ i ≤ j ≤ n.
// Total count: n(n+1)/2
export function generateIndecomposables(n: number): Module[] {
  const modules: Module[] = []
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= n; j++) {
      modules.push(makeModule(i, j))
    }
  }
  return modules
}
