import { RevenueChart } from "@/components/RevenueChart"
import { StatCard } from "@/components/StatCard"

export default function Dashboard() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Revenue" value="$48,200" change={12} />
      <StatCard label="Orders" value="1,204" change={-3} />
      <StatCard label="Customers" value="3,910" change={5} />
      <div className="sm:col-span-3">
        <RevenueChart />
      </div>
    </div>
  )
}
