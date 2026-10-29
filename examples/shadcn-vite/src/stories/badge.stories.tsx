import type { Meta, StoryObj } from "@storybook/react-vite"
import { Badge } from "../components/ui/badge"

const meta = {
  component: Badge,
  args: { children: "Pro plan" }
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Secondary: Story = { args: { variant: "secondary" } }
export const Outline: Story = { args: { variant: "outline" } }
