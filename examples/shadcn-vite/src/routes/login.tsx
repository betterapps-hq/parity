import { createFileRoute, useNavigate } from "@tanstack/react-router"

import {
  Button,
  Input,
  Label,
} from "@buildkitgg/shadcn-baseui-nova"

import { PageHeader } from "@/components/page-header"
import { signIn } from "@/lib/auth"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const navigate = useNavigate()

  return (
    <form
      className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        signIn()
        void navigate({ to: "/dashboard" })
      }}
    >
      <PageHeader title="Log in" description="Welcome back to Acme." />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit">Log in</Button>
    </form>
  )
}
