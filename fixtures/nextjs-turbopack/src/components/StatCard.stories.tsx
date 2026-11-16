import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { StatCard } from "./StatCard"

const meta = {
  title: "Dashboard/StatCard",
  component: StatCard,
  args: { label: "Revenue", value: "$48,200", change: 12 }
} satisfies Meta<typeof StatCard>

export default meta
type Story = StoryObj<typeof meta>

export const Rising: Story = {}

export const Falling: Story = { args: { label: "Orders", value: "1,204", change: -3 } }
