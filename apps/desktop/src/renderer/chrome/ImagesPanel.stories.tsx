import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { ImagesPanel } from "./AssetsPanel.tsx"
import { panelLimits, setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"

/**
 * The Images tab, which will offer stock photos. For now it says how to add an image instead: paste it onto the
 * canvas. Shown in the left panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Images",
  component: ImagesPanel,
  render: () => <LeftPanel />,
  decorators: [
    (Story) => (
      <ProjectStage>
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof ImagesPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Stock photos are coming; until then, paste an image onto the canvas. */
export const ComingSoon: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ leftTab: "images" })
    }
  ]
}

/** The same message in the panel at its narrowest. */
export const NarrowPanel: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ leftTab: "images", leftWidth: panelLimits.left[0] })
    }
  ]
}
