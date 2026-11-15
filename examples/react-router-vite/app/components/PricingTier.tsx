import { Button } from "./Button"

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
    <div className={`flex flex-col rounded-lg border p-6 ${featured ? "border-brand ring-brand ring-1" : "border-border"}`}>
      <h3 className="font-semibold">{name}</h3>
      <p className="mt-2 text-3xl font-bold">
        {price}
        <span className="text-muted-foreground text-sm font-normal"> / month</span>
      </p>
      <ul className="text-muted-foreground mt-6 flex-1 space-y-2 text-sm">
        {features.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>
      <Button variant={featured ? "primary" : "secondary"} className="mt-6 w-full">
        Choose {name}
      </Button>
    </div>
  )
}
