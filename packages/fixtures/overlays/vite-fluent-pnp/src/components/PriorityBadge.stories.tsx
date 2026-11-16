import type { Meta, StoryObj } from "@storybook/react-vite"
import { PriorityBadge } from "./PriorityBadge.tsx"

const meta = {
  component: PriorityBadge,
  args: { priority: "normal" }
} satisfies Meta<typeof PriorityBadge>

export default meta

type Story = StoryObj<typeof meta>

export const Normal: Story = {}

export const Urgent: Story = { args: { priority: "urgent" } }
