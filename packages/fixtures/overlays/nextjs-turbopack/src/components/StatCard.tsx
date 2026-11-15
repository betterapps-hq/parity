import { ArrowTrendingDownIcon, ArrowTrendingUpIcon } from "@heroicons/react/20/solid"
import styles from "./StatCard.module.css"

export interface StatCardProps {
  label: string
  value: string
  /** Change since the last period, in percent. */
  change?: number
}

export function StatCard({ label, value, change }: StatCardProps) {
  const Arrow = change !== undefined && change < 0 ? ArrowTrendingDownIcon : ArrowTrendingUpIcon

  return (
    <div className={styles.card}>
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className={styles.value}>{value}</span>
        {change !== undefined && (
          <span
            className={`flex items-center gap-1 text-sm font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            <Arrow className="size-4" />
            {change >= 0 ? "+" : ""}
            {change}%
          </span>
        )}
      </div>
    </div>
  )
}
