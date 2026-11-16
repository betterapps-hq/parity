import { createFileRoute } from "@tanstack/react-router"

import { PageHeader } from "@/components/page-header"
import { PlanCard } from "@/components/plan-card"

export const Route = createFileRoute("/pricing")({ component: Pricing })

const plans = [
  {
    name: "Starter",
    price: "$0",
    description: "For trying things out",
    features: ["1 project", "Community support"],
  },
  {
    name: "Team",
    price: "$24",
    description: "For small teams shipping often",
    features: ["Unlimited projects", "Shared libraries", "Email support"],
    popular: true,
  },
  {
    name: "Business",
    price: "$64",
    description: "For larger organizations",
    features: ["Single sign-on", "Audit log"],
  },
]

function Pricing() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <PageHeader
        title="Plans for every team"
        description="Start free, and upgrade when you need more."
        centered
      />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.name} {...plan} />
        ))}
      </div>
    </div>
  )
}
