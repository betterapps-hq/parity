import { designsSelection, layersSelection, type Selection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
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
import { AppMenu } from "./AppMenu.tsx"
import { exampleOpen, renameDesign, Window } from "./chrome-fixtures.tsx"
import { formatKeys } from "./keys.ts"
import { setLayout } from "./layout.ts"
import { setPreferences } from "./preferences.ts"

/**
 * The File, Edit, View, Object, Arrange and Help menus in the title bar, on their own, each opened on a project in some
 * state. Each menu reads the active tab when it opens, so what it offers depends on what's selected. With no canvas
 * beside them, zooming is unavailable. Stories are named for their menu, in the menus' order. The dialogs the items
 * open have stories of their own: Settings, Keyboard shortcuts, Search and About.
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

type MenuName = "File" | "Edit" | "View" | "Object" | "Arrange" | "Help"

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

const body = () => within(document.body)

/** A story that opens `name` once `setup` has readied the project, then runs `check` on the open menu. */
function opened(name: MenuName, setup: () => Promise<void> = exampleOpen, check?: () => Promise<void>): Story {
  return {
    loaders: [setup],
    play: async () => {
      await openMenu(name)
      await check?.()
    }
  }
}

/** Readies the example with `selection` made, after `before`, which can change the project first. */
function selecting(selection: () => Selection, before?: () => void): () => Promise<void> {
  return async () => {
    await openProjects("example")
    before?.()
    example().selection.set(selection())
  }
}

/** Opens one of the title bar's menus, as a click on its name does. */
async function openMenu(name: MenuName): Promise<void> {
  await userEvent.click(await body().findByRole("menuitem", { name }))
  await body().findByRole("menu")
}

/** Opens a submenu of the open menu, as a click on it does. */
async function openSubmenu(name: string): Promise<void> {
  await userEvent.click(body().getByRole("menuitem", { name }))
  await expect((await body().findAllByRole("menu")).length).toBe(2)
}

/** The open menu's items, by label: whether each is unavailable, and undefined for one it doesn't list. */
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

/** The open menu's first item, with its keys. */
function firstItem(): HTMLElement {
  return within(body().getByRole("menu")).getAllByRole("menuitem")[0]!
}

const pricing = () => ({ design: design("Pricing") })

const hero = () => layersSelection(design("Pricing"), [node("Pricing", "Hero")])

/** The value of Dashboard's Users card, a layer inside an instance, which belongs to its component. */
const valueInUsersCard = () =>
  layersSelection(design("Dashboard"), [`${node("Dashboard", "Users card")}/${node("Stat card", "Value")}`])

// File

/**
 * File with a design selected: a new tab, opening projects, saving, exporting it or every design, Settings, closing the
 * tab and exiting. New screen and New component are Object's.
 */
export const File = opened("File", selecting(pricing), async () => {
  await expect(firstItem()).toHaveTextContent(`New tab${formatKeys("Ctrl T")}`)
  await expect(unavailable(["New screen", "Settings"])).toEqual({ "New screen": undefined, Settings: false })
})

/** File with every project closed: saving, exporting and closing a tab are unavailable. */
export const FileWithNoProject = opened("File", () => openProjects())

/** File with nothing selected: every design can be exported, but not a selected one. */
export const FileWithNothingSelected = opened("File")

/** File > Open recent: the open project first, then the others, most recent first; long paths are cut short. */
export const FileOpenRecent: Story = {
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

/** File > Open recent before any project was opened. */
export const FileOpenRecentEmpty: Story = {
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

/**
 * File > Export selected runs what Ctrl+Shift+E runs (PAR-976): both export the selected design at the Export section's
 * sizes, so both ask for the folder that export asks for. The whole window, whose keys Ctrl+Shift+E needs.
 */
export const FileExportSelectedAsItsShortcutDoes: Story = {
  render: () => <AppWindow />,
  loaders: [selecting(pricing)],
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

// Edit

/**
 * Edit after renaming a design, with a layer selected: Undo names the rename; cutting, copying, styles and deleting all
 * apply to the layer.
 */
export const Edit = opened(
  "Edit",
  selecting(
    () => layersSelection(design("Pricing (annual)"), [node("Pricing (annual)", "Hero")]),
    () => renameDesign("Pricing", "Pricing (annual)")
  )
)

/** Edit with nothing selected and nothing done yet: only pasting and selecting all are available. */
export const EditWithNothingSelected = opened("Edit")

/** Edit after a rename and a move, with the move undone: Undo names the rename and Redo the move. */
export const EditAfterUndo = opened(
  "Edit",
  selecting(
    () => ({ design: design("Pricing (annual)") }),
    () => {
      renameDesign("Pricing", "Pricing (annual)")
      const key = design("Pricing (annual)")
      const { position } = example().store.getEntry(key)!.container
      example().store.setPosition(key, { x: position.x + 400, y: position.y })
      example().store.undo()
    }
  )
)

/**
 * Edit after wrapping a layer in a layout: Repeat names what it would do again, with its keys (PAR-180). With another
 * layer selected, it wraps that one too.
 */
export const EditAfterWrapping = opened(
  "Edit",
  async () => {
    await selecting(hero)()
    void actions.wrap.run("key")
  },
  async () => {
    await expect(body().getByRole("menuitem", { name: /^Repeat wrap in layout/ })).toBeEnabled()
  }
)

/**
 * Edit with a layer inside an instance selected: Cut, Copy, Duplicate and Delete are unavailable, as the canvas and
 * Layers menus have them, since they can't act on it (PAR-971). Pasting over it or to replace it stays, and says why it
 * can't.
 */
export const EditLayerInInstance = opened("Edit", selecting(valueInUsersCard), async () => {
  await expect(unavailable(["Cut", "Copy", "Duplicate", "Delete", "Paste over selection", "Paste to replace"])).toEqual(
    {
      Cut: true,
      Copy: true,
      Duplicate: true,
      Delete: true,
      "Paste over selection": false,
      "Paste to replace": false
    }
  )
})

// View

/** View with a design selected: panels shown, snapping on, and the layout grid off. */
export const View = opened("View", async () => {
  await selecting(pricing)()
  preferring({ performanceStats: false })
})

/** View with the panels hidden, snapping off, and the layout grid on. */
export const ViewWithPanelsHidden = opened("View", async () => {
  await selecting(pricing)()
  setLayout({ left: false, right: false })
  setPreferences({ snapping: false, layoutGrid: true })
})

// Object

/**
 * Object with nothing selected: New screen, New component and Insert are what can be done (PAR-546), the rest is
 * unavailable, and a hint says what to select for it, in the glossary's words.
 */
export const ObjectWithNothingSelected = opened("Object", exampleOpen, async () => {
  const [first, second] = within(body().getByRole("menu")).getAllByRole("menuitem")
  await expect(first).toHaveTextContent(`New screen${formatKeys("Ctrl Alt N")}`)
  await expect(second).toHaveTextContent(`New component${formatKeys("Ctrl Alt Shift N")}`)
  await expect(unavailable(["New screen", "New component", "Insert…", "Wrap in layout"])).toEqual({
    "New screen": false,
    "New component": false,
    "Insert…": false,
    "Wrap in layout": true
  })
})

/** Object with a design selected on its own: inserting into it, and making it a component. */
export const ObjectDesign = opened("Object", selecting(pricing))

/** Object with one layer selected: wrapping and unwrapping it, ordering it among its siblings, and hiding it. */
export const ObjectOneLayer = opened("Object", selecting(hero))

/** Object with a layer inside an instance selected: wrapping it, ordering it, hiding it and locking it are unavailable. */
export const ObjectLayerInInstance = opened("Object", selecting(valueInUsersCard), async () => {
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
})

// Arrange

/** Arrange with nothing selected: everything unavailable, and a hint saying what to select. */
export const ArrangeWithNothingSelected = opened("Arrange")

/** Arrange with three layers of a design selected: aligning them, but not distributing them. */
export const ArrangeSeveralLayers = opened(
  "Arrange",
  selecting(() =>
    layersSelection(design("Pricing"), [
      node("Pricing", "Headline"),
      node("Pricing", "Lede"),
      node("Pricing", "Billing period")
    ])
  )
)

/** Arrange with three designs selected: aligning and distributing them. */
export const ArrangeThreeDesigns = opened(
  "Arrange",
  selecting(() => designsSelection([design("Pricing"), design("Sign in"), design("Settings")]))
)

// Help

/** Help: searching actions, the keyboard shortcuts, reporting a problem, the Developer submenu, updates and About. */
export const Help = opened("Help")

/** Help > Developer: developer tools, performance stats, the bitmap cache and the Parity CLI. */
export const HelpDeveloper = opened("Help", exampleOpen, async () => {
  await openSubmenu("Developer")
  await body().findByRole("menuitemcheckbox", { name: "Performance stats" })
})

/**
 * Help > Developer > Install the Parity CLI on Windows, where the folder just joined PATH: a new terminal finds it
 * (PAR-906). The whole window, which shows the toast.
 */
export const HelpInstallTheCli: Story = {
  render: () => <AppWindow />,
  loaders: [exampleOpen],
  play: async () => {
    await openMenu("Help")
    await openSubmenu("Developer")
    await userEvent.click(body().getByRole("menuitem", { name: "Install the Parity CLI…" }))
    await body().findByText("Installed the Parity CLI")
    // The toast slides in, so its description shows once it has.
    await waitFor(() => expect(body().getByText("Open a new terminal to run it.")).toBeVisible())
  }
}
