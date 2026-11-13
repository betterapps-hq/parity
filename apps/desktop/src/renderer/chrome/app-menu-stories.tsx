import { layersSelection, type Selection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { clearNotifications, design, example, node, openProjects } from "../stories/fixtures.tsx"
import { AppMenu } from "./AppMenu.tsx"
import { exampleOpen, Window } from "./chrome-fixtures.tsx"

/**
 * What the App menu's stories share, one file to a menu (`AppMenu.<menu>.stories.tsx`), so Storybook groups them under
 * Parity/Chrome/App menu by menu. Each story opens its menu on its own, in a strip like the title bar, over a project
 * in some state. Each menu reads the active tab when it opens, so what it offers depends on what's selected. With no
 * canvas beside them, zooming is unavailable.
 */

export type MenuName = "File" | "Edit" | "View" | "Object" | "Arrange" | "Help"

export type MenuStory = StoryObj<Meta<typeof AppMenu>>

/**
 * What every menu's stories share. Each file writes its own title, `Parity/Chrome/App menu/<menu>`, which Storybook
 * reads without running the file.
 */
export const menuStories = {
  component: AppMenu,
  render: () => <TitleBar />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof AppMenu>

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

export const body = () => within(document.body)

/** A story that opens `name` once `setup` has readied the project, then runs `check` on the open menu. */
export function opened(
  name: MenuName,
  setup: () => Promise<void> = exampleOpen,
  check?: () => Promise<void>
): MenuStory {
  return {
    loaders: [setup],
    play: async () => {
      await openMenu(name)
      await check?.()
    }
  }
}

/** Readies the example with `selection` made, after `before`, which can change the project first. */
export function selecting(selection: () => Selection, before?: () => void): () => Promise<void> {
  return async () => {
    await openProjects("example")
    before?.()
    example().selection.set(selection())
  }
}

/** Opens one of the title bar's menus, as a click on its name does. */
export async function openMenu(name: MenuName): Promise<void> {
  await userEvent.click(await body().findByRole("menuitem", { name }))
  await body().findByRole("menu")
}

/** Opens a submenu of the open menu, as a click on it does. */
export async function openSubmenu(name: string): Promise<void> {
  await userEvent.click(body().getByRole("menuitem", { name }))
  await expect((await body().findAllByRole("menu")).length).toBe(2)
}

/** The open menu's items, by label: whether each is unavailable, and undefined for one it doesn't list. */
export function unavailable(labels: readonly string[]): Record<string, boolean | undefined> {
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

/** The open menu's items, with their keys. */
export function menuItems(): HTMLElement[] {
  return within(body().getByRole("menu")).getAllByRole("menuitem")
}

/** Pricing, selected on its own. */
export const pricing = () => ({ design: design("Pricing") })

/** Pricing's Hero, one layer. */
export const hero = () => layersSelection(design("Pricing"), [node("Pricing", "Hero")])

/** The value of Dashboard's Users card, a layer inside an instance, which belongs to its component. */
export const valueInUsersCard = () =>
  layersSelection(design("Dashboard"), [`${node("Dashboard", "Users card")}/${node("Stat card", "Value")}`])
