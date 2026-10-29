import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { designsSelection, layersSelection } from "../selection.ts"
import {
  blankProjectAt,
  clearNotifications,
  design,
  example,
  frameDesigns,
  node,
  openAlso,
  openProjects,
  preferring
} from "../stories/fixtures.tsx"
import { workspace } from "../workspace.ts"
import { AppMenu } from "./AppMenu.tsx"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { setLayout } from "./layout.ts"
import { setPreferences } from "./preferences.ts"

/**
 * The File, Edit, View and Arrange menus in the title bar, opened over the whole window. Each reads the active tab
 * when it opens, so what it offers depends on what's selected.
 */
const meta = {
  title: "Parity/Chrome/App menu",
  component: AppMenu,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof AppMenu>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Opens one of the title bar's menus, as a click on its name does. */
async function openMenu(name: string): Promise<void> {
  await userEvent.click(await body().findByRole("menuitem", { name }))
  await body().findByRole("menu")
}

/** Opens a submenu of the open menu, as a click on it does. */
async function openSubmenu(name: string): Promise<void> {
  await userEvent.click(body().getByRole("menuitem", { name }))
  await expect((await body().findAllByRole("menu")).length).toBe(2)
}

/** The example with the Pricing design selected and framed. */
const pricingSelected = async () => {
  await openProjects("example")
  example().selection.set({ design: design("Pricing") })
}

/** File with a design selected: opening projects, saving, exporting, preferences, closing the tab and exiting. */
export const File: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("File")
  }
}

/** File with every project closed: saving, exporting and closing a tab are unavailable. */
export const FileWithNoProject: Story = {
  loaders: [() => openProjects()],
  play: () => openMenu("File")
}

/** File's recent projects: the open one first, then the others most recent first; long paths are cut short. */
export const OpenRecent: Story = {
  loaders: [
    async () => {
      await openProjects()
      workspace.forgetRecent()
      await openAlso(
        ...[
          "D:/clients/northwind/customer-onboarding-and-billing-portal-redesign-2026",
          "D:/projects/admin-console",
          "C:/Users/sam/Documents/side-projects/recipe-box",
          "D:/projects/marketing-site"
        ].map(blankProjectAt)
      )
      await openProjects("example")
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await openMenu("File")
    await openSubmenu("Open recent")
  }
}

/** File's recent projects before any project was opened. */
export const OpenRecentWhenNothingOpenedYet: Story = {
  loaders: [
    async () => {
      await openProjects()
      workspace.forgetRecent()
    }
  ],
  play: async () => {
    await openMenu("File")
    await openSubmenu("Open recent")
  }
}

/** File's Export with a design selected: it or every design as PNGs, and the scale, 2x by default. */
export const Export: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("File")
    await openSubmenu("Export")
  }
}

/** File's Export with nothing selected and the scale set to 3x: only every design can be exported. */
export const ExportWithNothingSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setPreferences({ exportScale: 3 })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard", "Sign in", "Settings")
    await openMenu("File")
    await openSubmenu("Export")
  }
}

/** File's Preferences as they start: the dark theme, saving only when asked. */
export const Preferences: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "dark" })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await openMenu("File")
    await openSubmenu("Preferences")
  }
}

/** File's Preferences changed: the theme following the system, and saving automatically. */
export const PreferencesChanged: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "system", autosave: true })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await openMenu("File")
    await openSubmenu("Preferences")
  }
}

/**
 * Edit after renaming a design, with a layer selected: Undo names the rename; cutting, copying, styles, inserting
 * and deleting all apply to the layer.
 */
export const Edit: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
      example().selection.set(layersSelection(design("Pricing (annual)"), [node("Pricing (annual)", "Hero")]))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)")
    await openMenu("Edit")
  }
}

/** Edit with nothing selected and nothing done yet: only pasting and selecting all are available. */
export const EditWithNothingSelected: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard", "Sign in", "Settings")
    await openMenu("Edit")
  }
}

/** Edit after a rename and a move, with the move undone: Undo names the rename and Redo the move. */
export const EditAfterUndo: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
      const key = design("Pricing (annual)")
      const { position } = example().store.getEntry(key)!.container
      example().store.setPosition(key, { x: position.x + 400, y: position.y })
      example().store.undo()
      example().selection.set({ design: key })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)")
    await openMenu("Edit")
  }
}

/** View with a design selected: zooming, panels shown, snapping on, the layout grid and performance stats off. */
export const View: Story = {
  loaders: [
    async () => {
      await pricingSelected()
      preferring({ performanceStats: false })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("View")
  }
}

/**
 * View with the panels hidden, snapping off, and the layout grid and performance stats on, which the canvas and status
 * bar behind show.
 */
export const ViewWithPanelsHidden: Story = {
  loaders: [
    async () => {
      await pricingSelected()
      setLayout({ left: false, right: false })
      setPreferences({ snapping: false, layoutGrid: true })
      preferring({ performanceStats: true })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("View")
  }
}

/** Arrange with nothing selected: everything unavailable, and a hint saying what to select. */
export const ArrangeWithNothingSelected: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard", "Sign in", "Settings")
    await openMenu("Arrange")
  }
}

/** Arrange with one layout layer selected: wrapping, unwrapping and aligning, but not distributing. */
export const ArrangeOneLayer: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("Arrange")
  }
}

/** Arrange with three layers of a design selected: wrapping and aligning them, but not unwrapping or distributing. */
export const ArrangeSeveralLayers: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const pricing = design("Pricing")
      example().selection.set(
        layersSelection(pricing, [
          node("Pricing", "Headline"),
          node("Pricing", "Lede"),
          node("Pricing", "Billing period")
        ])
      )
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("Arrange")
  }
}

/** Arrange with three designs selected: aligning and distributing them, but not wrapping. */
export const ArrangeThreeDesigns: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(designsSelection([design("Pricing"), design("Sign in"), design("Settings")]))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Sign in", "Settings")
    await openMenu("Arrange")
  }
}
