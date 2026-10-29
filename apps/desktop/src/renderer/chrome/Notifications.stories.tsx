import type { Meta, StoryObj } from "@storybook/react-vite"
import { Toaster } from "@/components/ui/sonner"
import { AppWindow } from "../App.tsx"
import { layersSelection } from "../selection.ts"
import {
  clearNotifications,
  design,
  example,
  frameDesigns,
  holdToast,
  never,
  node,
  openProjects
} from "../stories/fixtures.tsx"
import { answering, pickingWith, service } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { copySelectionStyle, exportImages, save, saveCopy, unwrapSelection } from "./commands.ts"

/**
 * The notifications the window's commands show at its bottom right, each run as its menu item or shortcut would.
 * Each story points at its notification, which holds it open as it does for a person; moving the pointer away lets it
 * go after its usual few seconds.
 */
const meta = {
  title: "Parity/Chrome/Notifications",
  component: Toaster,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

/** The example with Pricing selected, as most commands here need. */
const pricingSelected = async () => {
  await openProjects("example")
  example().selection.set({ design: design("Pricing") })
}

/** Exporting writes into this folder, as if the person picked it. */
const exportFolder = "D:/exports/shadcn-vite"

/** Saving with File > Save after an edit: the files it wrote. It goes after two seconds. */
export const Saved: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void save()
    await holdToast("Saved")
  }
}

/** Saving when the project's file can't be written: the system's reason. */
export const SaveFailed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
      service.saveFails = true
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void save()
    await holdToast("Couldn't save")
  }
}

/** File > Save a copy, once a place is picked: where it went, and a button that shows it in the file manager. */
export const SavedACopy: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      pickingWith({ saveFile: () => Promise.resolve("D:/projects/shadcn-vite copy.par") })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    void saveCopy()
    await holdToast("Saved a copy")
  }
}

/** File > Save a copy when the place picked can't be written. */
export const SaveACopyFailed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      pickingWith({ saveFile: () => Promise.resolve("C:/Program Files/shadcn-vite copy.par") })
      service.saveFails = true
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    void saveCopy()
    await holdToast("Couldn't save the copy")
  }
}

/** While the selected design is being exported as PNGs: a spinner until it's done. */
export const Exporting: Story = {
  loaders: [
    async () => {
      await pricingSelected()
      pickingWith({ pickFolder: () => Promise.resolve(exportFolder) })
      answering({ "designs.export": () => never() })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    void exportImages("selection")
    await holdToast("Exporting the design…")
  }
}

/** File > Export > All designs as PNG, done: how many images, the folder, and a button that shows them. */
export const Exported: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      pickingWith({ pickFolder: () => Promise.resolve(exportFolder) })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    void exportImages("all")
    await holdToast(/^Exported \d+ images$/)
  }
}

/** An export that finished with problems in some frames: the export's result, then a warning listing them. */
export const ExportedWithWarnings: Story = {
  loaders: [
    async () => {
      await pricingSelected()
      pickingWith({ pickFolder: () => Promise.resolve(exportFolder) })
      answering({
        "designs.export": () => ({
          files: [`${exportFolder}/Pricing.png`, `${exportFolder}/Pricing (annual billing).png`],
          warnings: [
            "Pricing (annual billing) in Mobile: an image didn't load: /images/plans-hero.png",
            "Pricing in Desktop dark: rendering took longer than 10 seconds and was cut short"
          ]
        })
      })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    void exportImages("selection")
    await holdToast("Some frames had problems")
  }
}

/** An export that failed, with the reason. */
export const ExportFailed: Story = {
  loaders: [
    async () => {
      await pricingSelected()
      pickingWith({ pickFolder: () => Promise.resolve(exportFolder) })
      answering({
        "designs.export": () => {
          throw new Error("The offscreen renderer stopped responding")
        }
      })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    void exportImages("selection")
    await holdToast("Couldn't export")
  }
}

/** Ctrl+Shift+E with nothing selected: what to select to export. */
export const NothingSelectedToExport: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    void exportImages("selection")
    await holdToast("Select a design to export it")
  }
}

/** Edit > Copy style with a layer selected. It goes after a second and a half. */
export const CopiedStyle: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    copySelectionStyle()
    await holdToast("Copied the style")
  }
}

/** Arrange > Unwrap layout with a text layer selected, which isn't a layout. */
export const NotALayoutToUnwrap: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Headline")]))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing")
    unwrapSelection()
    await holdToast("Select a layout to unwrap it")
  }
}

/** After the project service restarted, a project that couldn't be opened again in it. */
export const CouldntReopen: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      answering({
        "project.open": () => {
          throw new Error("The project service couldn't start Vite: Cannot find module 'vite'")
        }
      })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    void workspace.reconnect()
    await holdToast("Couldn't reopen shadcn-vite")
  }
}
