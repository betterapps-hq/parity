import { createFileRoute } from "@tanstack/react-router"

import {
  Button,
  Input,
  Label,
} from "@buildkitgg/shadcn-baseui-nova"

export const Route = createFileRoute("/settings/profile")({
  component: Profile,
})

function Profile() {
  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <h2 className="text-lg font-semibold">Profile</h2>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" defaultValue="Priya Shah" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" defaultValue="priya@example.com" />
      </div>
      <Button type="submit" className="self-start">
        Save
      </Button>
    </form>
  )
}
