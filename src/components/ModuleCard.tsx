import type { Module } from '../types/mathTypes'

interface Props {
  module: Module
  isProjective: boolean
  isInjective: boolean
  small?: boolean
}

export default function ModuleCard({ module, isProjective, isInjective, small = false }: Props) {
  const both = isProjective && isInjective

  const bg = both
    ? 'bg-purple-100 border-purple-400 text-purple-800'
    : isProjective
    ? 'bg-blue-100 border-blue-400 text-blue-800'
    : isInjective
    ? 'bg-green-100 border-green-400 text-green-800'
    : 'bg-white border-gray-300 text-gray-800'

  return (
    <div
      className={`border rounded font-mono font-semibold text-center ${bg} ${
        small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {module.label}
    </div>
  )
}
