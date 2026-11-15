import { PricingTier } from "~/components/PricingTier"

const tiers = [
  { name: "Starter", price: "$0", features: ["3 projects", "5 members", "Community support"] },
  { name: "Team", price: "$12", features: ["Unlimited projects", "25 members", "Email support"], featured: true },
  { name: "Business", price: "$32", features: ["Unlimited everything", "Single sign-on", "Priority support"] },
]

export default function Pricing() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-center text-4xl font-bold">Pricing</h1>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <PricingTier key={tier.name} {...tier} />
        ))}
      </div>
    </section>
  )
}
