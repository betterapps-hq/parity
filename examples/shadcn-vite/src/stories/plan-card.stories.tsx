import type { Meta, StoryObj } from "@storybook/react-vite"

import { PlanCard } from "@/components/plan-card"

const meta = {
  title: "App/Plan card",
  component: PlanCard,
  args: {
    name: "Team",
    price: "$24",
    description: "For small teams shipping often",
    features: ["Unlimited projects", "Shared libraries", "Email support"],
  },
} satisfies Meta<typeof PlanCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Popular: Story = { args: { popular: true } }
