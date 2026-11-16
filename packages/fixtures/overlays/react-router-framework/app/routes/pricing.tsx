import { PricingTier } from "~/components/PricingTier"
import styles from "~/styles/pages.module.css"

const tiers = [
  { name: "Starter", price: "$0", features: ["3 projects", "5 members", "Community support"] },
  { name: "Team", price: "$12", features: ["Unlimited projects", "25 members", "Email support"], featured: true },
  { name: "Business", price: "$32", features: ["Unlimited everything", "Single sign-on", "Priority support"] },
]

export default function Pricing() {
  return (
    <section className={styles.page}>
      <h1 className={`${styles.title} ${styles.centered}`}>Pricing</h1>
      <div className={styles.tiers}>
        {tiers.map((tier) => (
          <PricingTier key={tier.name} {...tier} />
        ))}
      </div>
    </section>
  )
}
