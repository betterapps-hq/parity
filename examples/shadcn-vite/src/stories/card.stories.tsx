import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@buildkitgg/shadcn-baseui-nova"

const meta = {
  title: "UI/Card",
  component: Card
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Invite: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Invite by email</CardTitle>
        <CardDescription>New teammates get an email with a link to join Acme.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">They can start once they accept.</CardContent>
      <CardFooter>
        <Button>Send invite</Button>
      </CardFooter>
    </Card>
  )
}
