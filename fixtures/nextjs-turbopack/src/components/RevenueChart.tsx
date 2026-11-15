"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const months = [
  { month: "Jan", revenue: 31000 },
  { month: "Feb", revenue: 34500 },
  { month: "Mar", revenue: 33200 },
  { month: "Apr", revenue: 40100 },
  { month: "May", revenue: 43800 },
  { month: "Jun", revenue: 48200 }
]

export function RevenueChart({ data = months }: { data?: { month: string; revenue: number }[] }) {
  return (
    <div className="h-64 rounded-xl border border-gray-200 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-brand)"
            fill="var(--color-brand)"
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
