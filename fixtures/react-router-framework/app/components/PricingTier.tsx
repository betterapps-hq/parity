import { Check } from "@phosphor-icons/react"
import { Button } from "./Button"
import styles from "./PricingTier.module.css"

/** One plan on the pricing page, with what it includes. */
export function PricingTier({
  name,
  price,
  features,
  featured = false,
}: {
  name: string
  price: string
  features: string[]
  featured?: boolean
}) {
  return (
    <div className={`${styles.tier} ${featured ? styles.featured : ""}`}>
      <h3 className={styles.name}>{name}</h3>
      <p className={styles.price}>
        {price}
        <span className={styles.period}> / month</span>
      </p>
      <ul className={styles.features}>
        {features.map((feature) => (
          <li key={feature} className={styles.feature}>
            <Check size={16} weight="bold" />
            {feature}
          </li>
        ))}
      </ul>
      <Button variant={featured ? "primary" : "secondary"} className={styles.choose}>
        Choose {name}
      </Button>
    </div>
  )
}
