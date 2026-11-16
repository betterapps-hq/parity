import type { Meta, StoryObj } from "@storybook/react-vite"
import { StatCard } from "./StatCard.tsx"

const meta = {
  component: StatCard,
  args: { label: "Open tickets", value: "38", change: "12% this week" }
} satisfies Meta<typeof StatCard>

export default meta

type Story = StoryObj<typeof meta>

export const Rising: Story = {}

export const Falling: Story = { args: { label: "First reply", value: "2h 10m", change: "8% slower", trend: "down" } }
