import { setSlot } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { PropsSection } from "../inspector/sections/PropsSection.tsx"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, slowly, typing } from "./inspector-stories.tsx"
import { sectionStage, renderSection } from "./layer-stories.tsx"

/**
 * A component design's props, as its Design tab shows them: its params with their defaults, then its slots, each a
 * kind of prop that takes layers. Add makes a param or a slot.
 */
const meta = {
  title: "Parity/Inspector/Sections/Props/Component design",
  render: renderSection(() => <PropsSection />),
  decorators: [sectionStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Selects a component design. */
const selecting = (designName: string) => inspecting("design", () => ({ design: design(designName) }))

/** App top bar with its actions layout made a named slot, `actions`. */
const topBarWithSlot = () => {
  const key = design("App top bar")
  example().store.updateContainer(key, "Make slot", (container) =>
    setSlot(container, node("App top bar", "Top bar actions"), "actions")
  )

  return { design: key }
}

/** Plan card's params with their defaults. */
export const Params: Story = { loaders: [selecting("Plan card")] }

/**
 * A component design with a slot (PAR-83): Props lists App top bar's `actions` slot after its params, a kind of prop
 * that takes layers, with the layout it fills where a param has its default.
 */
export const WithASlot: Story = { loaders: [inspecting("design", topBarWithSlot)] }

/**
 * Two slots, Plan card's features and its price block: code nests the one holding the most layers, `features`, between
 * the tags, and passes `pricing` as a prop. Nothing left in Plan card can be a slot, so Add says why.
 */
export const WithSeveralSlots: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Plan card")
      example().store.updateContainer(key, "Make slot", (container) =>
        setSlot(
          setSlot(container, node("Plan card", "Features"), "features"),
          node("Plan card", "Price block"),
          "pricing"
        )
      )

      return { design: key }
    })
  ]
}

/** Add, then one of Plan card's layouts: it's a slot named after the layout, its name ready to rename. */
export const AddingASlot: Story = {
  loaders: [selecting("Plan card")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const add = await panel.findByRole("button", { name: "Add a prop" }, slowly)
    add.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Features" }, slowly))
    await expect(await panel.findByRole("textbox", { name: "features slot name" }, slowly)).toHaveFocus()
  }
}

/** Add, then Text: a row to name it, and Enter adds `subtitle`, a text prop with a default to change. */
export const AddingATextProp: Story = {
  loaders: [selecting("Plan card")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const add = await panel.findByRole("button", { name: "Add a prop" }, slowly)
    add.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Text" }, slowly))
    const name = await panel.findByRole("textbox", { name: "New text prop's name" }, slowly)
    await userEvent.type(name, "Subtitle{Enter}", typing)
    await expect(await panel.findByRole("textbox", { name: "Subtitle" }, slowly)).toHaveValue("Text")
  }
}

/** Renaming the slot after one of App top bar's params, `page`: the name stays, and the row says why. */
export const SlotNameTaken: Story = {
  loaders: [inspecting("design", topBarWithSlot)],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const name = await panel.findByRole("textbox", { name: "actions slot name" }, slowly)
    await userEvent.clear(name)
    await userEvent.type(name, "Page{Enter}", typing)
    await expect(await panel.findByRole("alert", undefined, slowly)).toHaveTextContent("A param is already called page")
  }
}

/** A component with many params, Project card's nineteen: switches for its booleans, inputs for the rest. */
export const ManyParams: Story = { loaders: [selecting("Project card")] }

/** A component with no params, App sidebar: every instance looks the same. */
export const NoParams: Story = { loaders: [selecting("App sidebar")] }
