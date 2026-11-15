import { updateView } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { inspecting } from "../chrome/inspector-stories.tsx"
import { renderDesignSection, sectionStage } from "../chrome/layer-stories.tsx"
import { design, example } from "../stories/fixtures.tsx"
import { BoardMenus } from "./BoardMenus.tsx"

/** Opens the title's menu whose button starts with `name`, and returns the list it opens. */
async function openMenu(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: new RegExp(`^${name}, `) }))

  return within(await screen.findByRole("dialog"))
}

/**
 * The menus in a board's title (PAR-1071): its states' and its modes', each with how many show. Each opens the
 * design's list, in its own order, to show, hide and move them. The project's modes themselves are in Panel › Modes
 * tab, which Edit modes opens.
 */
const meta = {
  title: "Parity/Canvas/Board menus",
  render: renderDesignSection(BoardMenus),
  decorators: [sectionStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Dashboard has one state, so no States menu, and its Modes menu lists all four modes, three of them shown. */
export const ModesMenu: Story = {
  loaders: [inspecting("design", () => ({ design: design("Dashboard") }))],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, "Modes")

    await expect(menu.getAllByRole("switch", { name: /^Show / })).toHaveLength(4)
    await expect(menu.getByRole("button", { name: "Edit modes" })).toBeVisible()
  }
}

/** Sign in shown in every mode: each switch in its Modes menu is on. */
export const EveryModeShown: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      updateView(example().doc, key, "Show Desktop Dark, Tablet Light and Mobile Light", (view) => ({
        ...view,
        modes: ["desktop-dark", "tablet-light", "mobile-light"]
      }))

      return { design: key }
    })
  ],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, "Modes")

    for (const each of menu.getAllByRole("switch", { name: /^Show / })) {
      await expect(each).toBeChecked()
    }
  }
}

/**
 * Sign in shown in Mobile Light first, rather than the project's primary mode, with Desktop Light beside it: Mobile
 * Light heads the list. Up on Desktop Light's handle moves it first, and both still show.
 */
export const AnotherModeFirst: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      updateView(example().doc, key, "Show Mobile Light first", (view) => ({
        ...view,
        mode: "mobile-light",
        modes: ["desktop-light"]
      }))

      return { design: key }
    })
  ],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, "Modes")
    const switches = () => menu.getAllByRole("switch", { name: /^Show / })

    await expect(switches()[0]).toHaveAccessibleName("Show Mobile Light")

    menu.getByRole("button", { name: "Move Desktop Light" }).focus()
    await userEvent.keyboard("{ArrowUp}")

    await waitFor(() => expect(switches()[0]).toHaveAccessibleName("Show Desktop Light"))
    await expect(switches()[0]).toBeChecked()
    await expect(menu.getByRole("switch", { name: "Show Mobile Light" })).toBeChecked()
  }
}

/** Button has several states, so its title has a States menu beside Modes, listing every one. */
export const StatesMenu: Story = {
  loaders: [inspecting("design", () => ({ design: design("Button") }))],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, "States")

    await expect(menu.getAllByRole("switch", { name: /^Show / }).length).toBeGreaterThan(1)
  }
}
