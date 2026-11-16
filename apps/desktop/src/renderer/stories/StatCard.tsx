import { type Stat, stats } from "./canvas-kit.tsx"

interface StatCardProps {
  id: Stat
}

/** One of the dashboard's stat cards, alone, for a drag's picture of it. */
export function StatCard({ id }: StatCardProps) {
  return (
    <div className="flex h-full flex-col gap-0.5 rounded-lg border border-neutral-200 bg-white p-2">
      <span className="text-[9px] text-neutral-500">{stats[id].label}</span>
      <span className="text-sm font-semibold tracking-tight">{stats[id].value}</span>
    </div>
  )
}
