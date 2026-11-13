import { createFileRoute } from "@tanstack/react-router"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@buildkitgg/shadcn-baseui-nova"

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
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Plans for every team</h1>
        <p className="text-muted-foreground">
          Start free, and upgrade when you need more.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {plan.name}
                {plan.popular && <Badge>Popular</Badge>}
              </CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-3xl font-semibold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  a month
                </span>
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
              >
                Choose {plan.name}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
