import { designsSelection, layersSelection } from "@parity-app/editor"
import type { Meta } from "@storybook/react-vite"
import { design, node } from "../stories/fixtures.tsx"
import { menuStories, opened, selecting } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"

/** Arrange: aligning and distributing what's selected. */
const meta = {
  title: "Parity/Chrome/App menu/Arrange",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

/** With nothing selected: everything unavailable. */
export const NothingSelected = opened("Arrange")

/** With three layers of a design selected: aligning them, but not distributing them. */
export const SeveralLayers = opened(
  "Arrange",
  selecting(() =>
    layersSelection(design("Pricing"), [
      node("Pricing", "Headline"),
      node("Pricing", "Lede"),
      node("Pricing", "Billing period")
    ])
  )
)

/** With three designs selected: aligning and distributing them. */
export const ThreeDesigns = opened(
  "Arrange",
  selecting(() => designsSelection([design("Pricing"), design("Sign in"), design("Settings")]))
)
