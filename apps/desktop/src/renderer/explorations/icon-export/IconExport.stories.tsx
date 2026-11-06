import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, screen, userEvent, within } from "storybook/test"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { IconExport, iconFileName } from "./icon-export.tsx"

/**
 * Exporting an icon set's icons as SVG files, designed for PAR-185 and set aside on 2026-11-05, kept in case it comes
 * back. Every icon, or those a search matches, at a size, in the text's color or black, each named in kebab case.
 */
const meta = {
  title: "Parity/Explorations/Icon export",
  component: IconExport,
  loaders: [() => openProjects("example")],
  decorators: [
    (Story) => (
      <ProjectStage className="h-screen bg-background text-foreground">
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof IconExport>

export default meta
type Story = StoryObj<typeof meta>

/** The set with nothing searched: the dialog offers every icon. */
export const EveryIcon: Story = {
  args: { initiallyOpen: true },
  play: async () => {
    const dialog = within(await screen.findByRole("dialog", { name: "Export Lucide icons" }))
    await expect(dialog.getByRole("radio", { name: /Every icon/ })).toBeChecked()
  }
}

/** After a search for "arrow": the dialog opens on the icons that match it. */
export const Matching: Story = {
  args: { initialQuery: "arrow" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Export Lucide icons" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Export Lucide icons" }))
    await expect(dialog.getByRole("radio", { name: /Those matching “arrow”/ })).toBeChecked()
    await within(dialog.getByRole("list", { name: /The first icons/ })).findByText("arrow-right.svg")
  }
}

/** File names in kebab case, as icon sets name theirs. */
export const FileNames: Story = {
  play: async () => {
    await expect(iconFileName("ArrowRight")).toBe("arrow-right.svg")
    await expect(iconFileName("Building2")).toBe("building-2.svg")
    await expect(iconFileName("SVGIcon")).toBe("svg-icon.svg")
  }
}
