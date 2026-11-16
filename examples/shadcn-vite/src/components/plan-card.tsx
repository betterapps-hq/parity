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

export interface PlanCardProps {
  name: string
  price: string
  description: string
  features: string[]
  popular?: boolean
}

export function PlanCard({
  name,
  price,
  description,
  features,
  popular = false,
}: PlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {name}
          {popular && <Badge>Popular</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-3xl font-semibold">
          {price}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            a month
          </span>
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button className="w-full" variant={popular ? "default" : "outline"}>
          Choose {name}
        </Button>
      </CardFooter>
    </Card>
  )
}
