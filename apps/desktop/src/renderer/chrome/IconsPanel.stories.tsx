import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { example, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { IconsPanel } from "./AssetsPanel.tsx"
import { panelLimits, setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"

/**
 * The Icons tab: every icon in the project's icon library, to drag into designs or click to add at the selection.
 * Shown in the left panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Icons",
  component: IconsPanel,
  render: () => <LeftPanel />,
  decorators: [
    (Story) => (
      <ProjectStage>
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof IconsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the example on the Icons tab. */
async function openIcons(): Promise<void> {
  await openProjects("example")
  setLayout({ leftTab: "icons" })
}

/** Opens the example on the Icons tab, as if the project had no icon library. */
async function openWithoutIcons(): Promise<void> {
  await openIcons()
  const { libraries } = example().info
  const icons = libraries.findIndex((library) => library.kind === "icons")
  if (icons >= 0) libraries.splice(icons, 1)
}

/**
 * Searches, as typing would. `userEvent.type` changes the field without React's change handler seeing it, so the value
 * is set the way React reads it.
 */
async function search(canvasElement: HTMLElement, text: string): Promise<void> {
  const field = within(canvasElement).getByRole("textbox", { name: /^Search \d+ Lucide icons$/ })
  field.focus()
  await fireEvent.input(field, { target: { value: text } })
}

/** Every Lucide icon, in a grid that fills the panel's width. */
export const AllIcons: Story = { loaders: [openIcons] }

/** A search: only the icons whose names match. */
export const Searching: Story = {
  loaders: [openIcons],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "arrow up")
  }
}

/** A search that matches no icon. */
export const NothingMatches: Story = {
  loaders: [openIcons],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "qwerty")
    await within(canvasElement).findByText("No icon matches.")
  }
}

/** At the panel's widest, the grid has more columns. */
export const WidePanel: Story = {
  loaders: [
    async () => {
      await openIcons()
      setLayout({ leftWidth: panelLimits.left[1] })
    }
  ]
}

/** A project without an icon library: the tab offers to add Lucide. */
export const NoIconLibrary: Story = { loaders: [openWithoutIcons] }

/** Lucide installing, after Add Lucide was clicked. */
export const InstallingLucide: Story = {
  loaders: [openWithoutIcons],
  play: async ({ canvasElement }) => {
    // The service never answers, so the install stays in progress.
    service.latency = 24 * 60 * 60 * 1000
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add Lucide" }))
    await waitFor(() => expect(within(document.body).getByText("Installing Lucide…")).toBeVisible())
  }
}
