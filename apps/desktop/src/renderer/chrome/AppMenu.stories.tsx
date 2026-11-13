import { designsSelection, layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
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
import { pickingWith } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { actions } from "./actions.ts"
import { openDialog } from "./app-dialogs.ts"
import { AppMenu } from "./AppMenu.tsx"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { formatKeys } from "./keys.ts"
import { setLayout } from "./layout.ts"
import { setPreferences } from "./preferences.ts"

/**
 * The File, Edit, View, Object, Arrange and Help menus in the title bar, on their own, and the dialogs they open, over
 * the whole window. Each menu reads the active tab when it opens, so what it offers depends on what's selected. With no
 * canvas beside them, zooming is unavailable.
 */
const meta = {
  title: "Parity/Chrome/App menu",
  component: AppMenu,
  render: () => <TitleBar />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof AppMenu>

export default meta

type Story = StoryObj<typeof meta>

/** The menus alone, in a strip like the title bar's, with room below for a menu to open. */
function TitleBar() {
  return (
    <div className="h-full bg-background text-foreground">
      <div className="flex h-10 items-end border-b px-2">
        <AppMenu />
      </div>
    </div>
  )
}

/** For a story about what a menu item opens, or a shortcut, which the whole window has. */
const inWindow = { render: () => <AppWindow /> }

const body = () => within(document.body)

/** Opens one of the title bar's menus, as a click on its name does. */
async function openMenu(name: string): Promise<void> {
  await userEvent.click(await body().findByRole("menuitem", { name }))
  await body().findByRole("menu")
}

/** Enters text in a field, as typing it would. `userEvent.type` changes the field without React's change handler. */
async function enter(field: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(field, { target: { value: text } })
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

/**
 * File with a design selected: a new tab, opening projects, saving, exporting it or every design, Settings, closing the
 * tab and exiting. New screen and New component are Object's.
 */
export const File: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await openMenu("File")
    const [first] = within(body().getByRole("menu")).getAllByRole("menuitem")
    await expect(first).toHaveTextContent(`New tab${formatKeys("Ctrl T")}`)
    await expect(unavailable(["New screen", "Settings"])).toEqual({ "New screen": undefined, Settings: false })
  }
}

/** The open menu starts with New screen and New component, available, each with its keys. */
async function expectNewItemsFirst(): Promise<void> {
  const [first, second] = within(body().getByRole("menu")).getAllByRole("menuitem")
  await expect(first).toHaveTextContent(`New screen${formatKeys("Ctrl Alt N")}`)
  await expect(second).toHaveTextContent(`New component${formatKeys("Ctrl Alt Shift N")}`)
  await expect(first).not.toHaveAttribute("data-disabled")
  await expect(second).not.toHaveAttribute("data-disabled")
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

/** File with nothing selected: every design can be exported, but not a selected one. */
export const FileWithNothingSelected: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openMenu("File")
  }
}

/**
 * File > Export selected runs what Ctrl+Shift+E runs (PAR-976): both export the selected design at the Export section's
 * sizes, so both ask for the folder that export asks for.
 */
export const ExportSelectedAsItsShortcutDoes: Story = {
  ...inWindow,
  loaders: [pricingSelected],
  play: async () => {
    const asked: (string | undefined)[] = []
    pickingWith({
      pickFolder: (title) => {
        asked.push(title)

        return Promise.resolve(undefined)
      }
    })
    await frameDesigns("Pricing")
    await openMenu("File")
    await userEvent.click(body().getByRole("menuitem", { name: /^Export selected…/ }))
    await waitFor(() => expect(asked).toEqual(["Export to"]))
    await userEvent.keyboard("{Control>}{Shift>}E{/Shift}{/Control}")
    await waitFor(() => expect(asked).toEqual(["Export to", "Export to"]))
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
    await openMenu("View")
  }
}

/** View with the panels hidden, snapping off, and the layout grid on. */
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
    await openMenu("View")
  }
}

/**
 * Object with nothing selected: New screen, New component and Insert are what can be done (PAR-546), the rest is
 * unavailable, and a hint says what to select for it, in the glossary's words.
 */
export const ObjectWithNothingSelected: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openMenu("Object")
    await expectNewItemsFirst()
    await expect(unavailable(["Insert…", "Wrap in layout"])).toEqual({
      "Insert…": false,
      "Wrap in layout": true
    })
  }
}

/** Object with a design selected on its own: inserting into it, and making it a component. */
export const ObjectDesign: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await openMenu("Object")
  }
}

/** Object with one layer selected: wrapping and unwrapping it, ordering it among its siblings, and hiding it. */
export const ObjectOneLayer: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))
    }
  ],
  play: async () => {
    await openMenu("Object")
  }
}

/** The value of Dashboard's Users card selected, a layer inside an instance, which belongs to its component. */
const valueInUsersCard = async () => {
  await openProjects("example")
  const inner = `${node("Dashboard", "Users card")}/${node("Stat card", "Value")}`
  example().selection.set(layersSelection(design("Dashboard"), [inner]))
}

/** Whether each of the open menu's items, by its label, is unavailable; undefined for one it doesn't list. */
function unavailable(labels: readonly string[]): Record<string, boolean | undefined> {
  const items = [...body().getByRole("menu").querySelectorAll("[role=menuitem]")]

  const label = (item: Element) =>
    [...item.childNodes]
      // A shortcut or icon inside an item isn't part of its name.
      .flatMap((child) =>
        child instanceof Element && child.matches("[data-slot=menubar-shortcut], svg") ? [] : [child.textContent]
      )
      .join("")
      .trim()

  return Object.fromEntries(
    labels.map((name) => [name, items.find((item) => label(item) === name)?.hasAttribute("data-disabled")])
  )
}

/**
 * Edit with a layer inside an instance selected: Cut, Copy, Duplicate and Delete are unavailable, as the canvas and
 * Layers menus have them, since they can't act on it (PAR-971). Pasting over it or to replace it stays, and says why it
 * can't.
 */
export const EditLayerInInstance: Story = {
  loaders: [valueInUsersCard],
  play: async () => {
    await openMenu("Edit")
    await expect(
      unavailable(["Cut", "Copy", "Duplicate", "Delete", "Paste over selection", "Paste to replace"])
    ).toEqual({
      Cut: true,
      Copy: true,
      Duplicate: true,
      Delete: true,
      "Paste over selection": false,
      "Paste to replace": false
    })
  }
}

/** Object with a layer inside an instance selected: wrapping it, ordering it, hiding it and locking it are unavailable. */
export const ObjectLayerInInstance: Story = {
  loaders: [valueInUsersCard],
  play: async () => {
    await openMenu("Object")

    const items = [
      "Wrap in layout",
      "Bring forward",
      "Send backward",
      "Bring to front",
      "Send to back",
      "Hide or show",
      "Lock or unlock"
    ]

    await expect(unavailable(items)).toEqual(Object.fromEntries(items.map((name) => [name, true])))
  }
}

/** Arrange with nothing selected: everything unavailable, and a hint saying what to select. */
export const ArrangeWithNothingSelected: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openMenu("Arrange")
  }
}

/** Arrange with three layers of a design selected: aligning them, but not distributing them. */
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
    await openMenu("Arrange")
  }
}

/** Arrange with three designs selected: aligning and distributing them. */
export const ArrangeThreeDesigns: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(designsSelection([design("Pricing"), design("Sign in"), design("Settings")]))
    }
  ],
  play: async () => {
    await openMenu("Arrange")
  }
}

/** Help: searching actions, the keyboard shortcuts, reporting a problem, the Developer submenu, updates and About. */
export const Help: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openMenu("Help")
  }
}

/** Help > Developer: developer tools, performance stats, the bitmap cache and the Parity CLI. */
export const DeveloperMenu: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openMenu("Help")
    await openSubmenu("Developer")
    await body().findByRole("menuitemcheckbox", { name: "Performance stats" })
  }
}

/** Help > Developer > Install the Parity CLI on Windows, where the folder just joined PATH: a new terminal finds it (PAR-906). */
export const InstalledParityCommand: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await openMenu("Help")
    await openSubmenu("Developer")
    await userEvent.click(body().getByRole("menuitem", { name: "Install the Parity CLI…" }))
    await body().findByText("Installed the Parity CLI")
    // The toast slides in, so its description shows once it has.
    await waitFor(() => expect(body().getByText("Open a new terminal to run it.")).toBeVisible())
  }
}

/** File > Settings as they start: the dark theme, saving only when asked, snapping on, and exporting at 2x. */
export const Settings: Story = {
  ...inWindow,
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "dark", performanceStats: false })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("settings")
    await body().findByRole("dialog", { name: "Settings" })
  }
}

/** Settings changed: the theme following the system, saving automatically, the layout grid on and 3x exports. */
export const SettingsChanged: Story = {
  ...inWindow,
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "system", autosave: true, performanceStats: false })
      setPreferences({ layoutGrid: true, exportScale: 3 })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("settings")
    await body().findByRole("dialog", { name: "Settings" })
  }
}

/** Help > Keyboard shortcuts: every shortcut by group, with the keys held while dragging or clicking. */
export const KeyboardShortcuts: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("shortcuts")
    await body().findByRole("dialog", { name: "Keyboard shortcuts" })
  }
}

/** The keyboard shortcuts searched for "layer": the selection keys and the ones that act on a layer. */
export const KeyboardShortcutsSearched: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("shortcuts")
    await enter(await body().findByRole("textbox", { name: "Search shortcuts" }), "layer")
    await expect(body().getByText("Select the next layer")).toBeInTheDocument()
    await expect(body().queryByText("Zoom in")).not.toBeInTheDocument()
  }
}

/** Help > Search actions, searched for "zoom", with nothing selected, so zooming to the selection is unavailable. */
export const SearchActions: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("actions")
    await enter(await body().findByRole("combobox"), "zoom")
  }
}

/**
 * Search actions with a design locked: Lock or unlock is named Unlock, as the menus name it, and searching "lock" finds it
 * by the keymap's name (PAR-971).
 */
export const SearchActionsNamesWhatItDoes: Story = {
  ...inWindow,
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Sign in") })
    }
  ],
  play: async () => {
    await frameDesigns("Sign in")
    void actions.lock.run("menu")
    openDialog("actions")
    await enter(await body().findByRole("combobox"), "lock")
    const dialog = await body().findByRole("dialog", { name: "Search" })
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toContain(`Unlock${formatKeys("Ctrl Shift L")}`)
    )
  }
}

/**
 * Search actions searched for "new": New screen and New component, with their keys, in the Object group, then New tab in
 * File. It matches the start of words, so nothing with n, e and w scattered through its name comes up (PAR-546).
 */
export const SearchActionsForNew: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("actions")
    await enter(await body().findByRole("combobox"), "new")
    const dialog = await body().findByRole("dialog", { name: "Search" })
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual([
        `New screen${formatKeys("Ctrl Alt N")}`,
        `New component${formatKeys("Ctrl Alt Shift N")}`,
        `New tab${formatKeys("Ctrl T")}`
      ])
    )
  }
}

/** The search's rows under each heading, as the headings and the rows' text. */
const searchRows = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLElement>("[cmdk-group]")].map((group) => ({
    heading: group.querySelector("[cmdk-group-heading]")?.textContent,
    rows: within(group)
      .getAllByRole("option")
      .map((option) => option.textContent)
  }))

/**
 * Search actions finds anything in the project (PAR-180): searched for "card", the designs named for it, then their
 * layers, each with its design, the components to insert, with where each is from, and the tokens. Picking a design
 * selects it and zooms to it, a layer selects it, a component inserts it at the selection, and a token opens Tokens
 * searched for it.
 */
export const SearchEverything: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("actions")
    await enter(await body().findByRole("combobox"), "card")
    const dialog = await body().findByRole("dialog", { name: "Search" })
    await waitFor(() =>
      expect(searchRows(dialog).map((group) => group.heading)).toEqual(["Designs", "Layers", "Components", "Tokens"])
    )
    await expect(searchRows(dialog)[0]!.rows).toEqual(["Plan card", "Stat card", "Project card"])
  }
}

/**
 * What was picked lately leads the list, latest first (PAR-180): after zooming to fit and picking the Plan card design,
 * Search actions opens with those two under Recent, and doesn't list them again below.
 */
export const SearchRecent: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")

    for (const [search, pick] of [
      ["fit", "Zoom to fit"],
      ["plan", "Plan card"]
    ] as const) {
      openDialog("actions")
      await enter(await body().findByRole("combobox"), search)

      // The first row of that name: the design rather than the component that inserts it.
      const [row] = await within(await body().findByRole("dialog")).findAllByRole("option", {
        name: new RegExp(`^${pick}`)
      })

      await userEvent.click(row!)
      await waitFor(() => expect(body().queryByRole("dialog")).not.toBeInTheDocument())
    }

    await expect(example().selection.get().design).toBe(design("Plan card"))
    openDialog("actions")
    const dialog = await body().findByRole("dialog", { name: "Search" })
    await waitFor(() =>
      expect(searchRows(dialog)[0]).toEqual({
        heading: "Recent",
        rows: ["Plan card", `Zoom to fit${formatKeys("Shift 1")}`]
      })
    )
  }
}

/**
 * Edit after wrapping a layer in a layout: Repeat names what it would do again, with its keys (PAR-180). With another
 * layer selected, it wraps that one too.
 */
export const EditAfterWrapping: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const pricing = design("Pricing")
      example().selection.set(layersSelection(pricing, [node("Pricing", "Hero")]))
      void actions.wrap.run("key")
    }
  ],
  play: async () => {
    await openMenu("Edit")
    await expect(body().getByRole("menuitem", { name: /^Repeat wrap in layout/ })).toBeEnabled()
  }
}

/** Help > About Parity: its version, the Electron and Chromium it runs on, and how it gets updates. */
export const About: Story = {
  ...inWindow,
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    openDialog("about")
    await body().findByRole("dialog", { name: "Parity" })
  }
}
