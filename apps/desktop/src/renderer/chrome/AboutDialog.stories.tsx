import type { Meta, StoryObj } from "@storybook/react-vite"
import { dialogStories, exampleOpen, openOverExample } from "./chrome-fixtures.tsx"

/** About Parity, from Help > About Parity, over the window. */
const meta = {
  title: "Parity/Chrome/About",
  ...dialogStories
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Its version, the Electron and Chromium it runs on, and how it gets updates. */
export const Default: Story = {
  loaders: [exampleOpen],
  play: async () => {
    await openOverExample("about", "Parity")
  }
}
