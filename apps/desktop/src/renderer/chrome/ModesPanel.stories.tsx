import { defaultModeSettings, type ModeSettings, type ModeSpec } from "@parity/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { example } from "../stories/fixtures.tsx"
import { answerNext } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { inspecting, InspectorStage, openInspector, search, slowly, typing } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"
import { ModesPanel } from "./ModesPanel.tsx"

/**
 * The inspector's Modes tab: the project's modes, shared by every design, each a named combination of one option per
 * variable (viewport, theme, locale), and the variables themselves. The first mode is the primary frame everywhere.
 */
const meta = {
  title: "Parity/Inspector/Modes",
  component: ModesPanel,
  render: () => <Inspector />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof ModesPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the example on the Modes tab, after `change` edits its modes when given. */
const modes = (change?: (settings: ModeSettings) => ModeSettings) =>
  inspecting("modes", () => {
    const { store } = example()
    if (change) store.setModes(change(store.getModes()))
  })

/** A project with no modes of its own, so it uses the defaults: the blank project, as the service opens it. */
const defaults = () =>
  openInspector("modes", ["empty"], () =>
    answerNext("project.open", async (_, real) => ({
      ...((await real()) as ProjectInfo),
      modes: { settings: defaultModeSettings, custom: false }
    }))
  )

/** The example's own modes, saved in its project file: four modes over viewport, theme and locale. */
export const ExampleModes: Story = { loaders: [modes()] }

/** A project using the default modes: it says editing them saves them into its project file. */
export const DefaultModes: Story = { loaders: [defaults] }

/** The default modes after an edit, not yet saved: a mode added. */
export const DefaultModesEdited: Story = {
  loaders: [
    async () => {
      await defaults()
      const store = activeStore()
      const settings = store.getModes()
      store.setModes({
        ...settings,
        modes: [
          ...settings.modes,
          { id: "mobile-dark", name: "Mobile Dark", values: { viewport: "mobile", theme: "dark" } }
        ]
      })
    }
  ]
}

/** Only one mode: it's the primary, and it can't be deleted. */
export const OneMode: Story = {
  loaders: [modes((settings) => ({ ...settings, modes: settings.modes.slice(0, 1) }))],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Desktop Light actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** Many modes, every viewport in both themes and a right-to-left locale, in a long list. */
export const ManyModes: Story = {
  loaders: [
    modes((settings) => ({
      ...settings,
      modes: ["desktop", "tablet", "mobile"]
        .flatMap((viewport) =>
          ["light", "dark"].map((theme): ModeSpec => ({
            id: `${viewport}-${theme}`,
            name: `${capital(viewport)} ${capital(theme)}`,
            values: { viewport, theme }
          }))
        )
        .concat({
          id: "mobile-light-ar",
          name: "Mobile Light Arabic (RTL)",
          values: { viewport: "mobile", theme: "light", locale: "ar" }
        })
    }))
  ]
}

/** A variable of the project's own, Density, beside the built-in kinds: its options show what they add to a frame. */
export const CustomVariable: Story = {
  loaders: [
    modes((settings) => ({
      ...settings,
      variables: [
        ...settings.variables,
        {
          id: "density",
          name: "Density",
          kind: "custom",
          options: [
            { id: "comfortable", name: "Comfortable" },
            { id: "compact", name: "Compact", className: "density-compact", attributes: { "data-density": "compact" } }
          ]
        }
      ],
      modes: settings.modes.map((mode, index) =>
        index === 1 ? { ...mode, values: { ...mode.values, density: "compact" } } : mode
      )
    }))
  ]
}

/** Long names: a mode named by hand, and viewport sizes named after devices. */
export const LongNames: Story = {
  loaders: [
    modes((settings) => ({
      ...settings,
      variables: settings.variables.map((variable) =>
        variable.kind === "viewport"
          ? {
              ...variable,
              options: [
                ...variable.options,
                { id: "galaxy-z-fold", name: "Samsung Galaxy Z Fold 6, unfolded", width: 884, height: 1104 }
              ]
            }
          : variable
      ),
      modes: [
        ...settings.modes,
        {
          id: "fold-review",
          name: "Foldable review for the checkout redesign, in Arabic",
          values: { viewport: "galaxy-z-fold", theme: "dark", locale: "ar" }
        }
      ]
    }))
  ]
}

/** The add button opened: a blank mode, then sizes and devices to add a mode for. */
export const AddingAMode: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add mode" }))
    await within(document.body).findByPlaceholderText("Search sizes and devices", undefined, slowly)
  }
}

/** Searching the sizes to add, for iPhones. */
export const SearchingSizes: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add mode" }))
    await search(
      await within(document.body).findByPlaceholderText("Search sizes and devices", undefined, slowly),
      "iphone"
    )
  }
}

/** A search that matches no size. */
export const NoSizeMatches: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add mode" }))
    await search(
      await within(document.body).findByPlaceholderText("Search sizes and devices", undefined, slowly),
      "watch"
    )
  }
}

/** A mode's menu open: make it primary, duplicate it, or delete it. */
export const ModeMenu: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Desktop Dark actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** The primary mode's menu: it's primary already. */
export const PrimaryModeMenu: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Desktop Light actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** A mode's theme being changed: each option with what it does to a frame. */
export const ChangingAnOption: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("combobox", { name: "Theme" })[1]!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** A mode's viewport being changed: each size with its device icon and width. */
export const ChangingTheViewport: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("combobox", { name: "Viewport" })[0]!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** A mode being renamed in place. */
export const RenamingAMode: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    const name = within(canvasElement).getByDisplayValue("Tablet Light")
    await userEvent.clear(name)
    await userEvent.type(name, "iPad review", typing)
  }
}

/** The viewport variable's add button opened, to add a size every mode can use. */
export const AddingAViewportSize: Story = {
  loaders: [modes()],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a viewport size" }))
    await within(document.body).findByPlaceholderText("Search sizes and devices", undefined, slowly)
  }
}

/** The active project's designs and modes, for a project other than the example. */
function activeStore() {
  const session = workspace.getActive()?.session
  if (!session) throw new Error("No project is open")
  return session.store
}

function capital(word: string): string {
  return word[0]!.toUpperCase() + word.slice(1)
}
