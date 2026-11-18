import { Badge, Button } from "@buildkitgg/shadcn"

/** Plan card's props, named as the example app's Plan card component declares them. */
export interface PlanCardProps {
  plan: string
  description: string
  price: string
  period: string
  popular: boolean
  action: string
  variant: "default" | "outline"
}

/** Each prop and the kind of value it takes, in the order the component declares them and the panel lists them. */
export const planCardProps: { name: keyof PlanCardProps; type: "text" | "boolean" | "variant" }[] = [
  { name: "plan", type: "text" },
  { name: "description", type: "text" },
  { name: "price", type: "text" },
  { name: "period", type: "text" },
  { name: "popular", type: "boolean" },
  { name: "action", type: "text" },
  { name: "variant", type: "variant" }
]

/** What `variant` can be, as the button it styles offers. */
/** Whether `name`, as a prop row reports it, is one of Plan card's props. */
export const isPlanCardProp = (name: string): name is keyof PlanCardProps =>
  planCardProps.some((prop) => prop.name === name)

export const variantOptions = [
  { id: "default", name: "default" },
  { id: "outline", name: "outline" }
]

/** The example app's Plan card, drawn live from its props so a change shows at once. */
export function PlanCard(props: PlanCardProps) {
  return (
    <div className="flex w-60 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-1 p-5">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{props.plan}</span>
          {props.popular && <Badge>Popular</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{props.description}</p>
        <p className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{props.price}</span>
          <span className="text-sm text-muted-foreground">{props.period}</span>
        </p>
      </div>
      <div className="border-t bg-muted/40 p-4">
        <Button variant={props.variant} className="w-full">
          {props.action}
        </Button>
      </div>
    </div>
  )
}
