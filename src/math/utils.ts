import type { Module } from '../types/mathTypes'

export function moduleId(i: number, j: number): string {
  return `${i}_${j}`
}

export function moduleLabel(i: number, j: number): string {
  return `[${i},${j}]`
}

export function makeModule(i: number, j: number): Module {
  return { i, j, id: moduleId(i, j), label: moduleLabel(i, j) }
}

export function findModule(modules: Module[], i: number, j: number): Module | undefined {
  return modules.find(m => m.i === i && m.j === j)
}
