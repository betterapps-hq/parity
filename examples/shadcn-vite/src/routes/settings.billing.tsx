import { createFileRoute, Link } from "@tanstack/react-router"

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@buildkitgg/shadcn-baseui-nova"

export const Route = createFileRoute("/settings/billing")({
  component: Billing,
})

function Billing() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Billing</h2>
      <Card>
        <CardHeader>
          <CardTitle>Team plan</CardTitle>
          <CardDescription>$24 a month, renews on December 1</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">5 of 10 seats used</span>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/pricing" />}
            >
              Change plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
