import { setSlot } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, slowly, typing } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The inspector's Design tab, which follows the selection: a prompt when nothing is selected, then the selected design
 * (its name, kind, states, components or params, and the modes it's shown in), a mode column, or text on the canvas.
 */
const meta = {
  title: "Parity/Inspector/Design",
  component: DesignTab,
  render: () => <Inspector />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Nothing selected: it asks for a screen or component on the canvas or in Layers, in the glossary's words, and says how
 * to reach their layers. It says the same whatever is on the canvas, since every project opens on a screen (PAR-560).
 */
export const NothingSelected: Story = {
  loaders: [inspecting("design")],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Select a screen or component on the canvas or in Layers.")
    ).toBeVisible()
  }
}

/** A screen selected: Pricing, with its two states, the button that finds repeated parts, and its modes. */
export const ScreenSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Pricing") }))] }

/** A component design selected: Plan card's params with their defaults, and the three places it's used. */
export const ComponentSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Plan card") }))] }

/** App top bar with its actions layout made a named slot, `actions`. */
const topBarWithSlot = () => {
  const key = design("App top bar")
  example().store.updateContainer(key, "Make slot", (container) =>
    setSlot(container, node("App top bar", "Top bar actions"), "actions")
  )

  return { design: key }
}

/**
 * A component design with a slot (PAR-83): Props lists App top bar's `actions` slot after its params, a kind of prop
 * that takes layers, with the layout it fills where a param has its default. In code, below Modes, shows how an
 * instance reads.
 */
export const ComponentWithSlots: Story = { loaders: [inspecting("design", topBarWithSlot)] }

/**
 * Two slots, Plan card's features and its price block: code nests the one holding the most layers, `features`, between
 * the tags, and passes `pricing` as a prop. Nothing left in Plan card can be a slot, so Add says why.
 */
export const ComponentWithSeveralSlots: Story = {
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

/** Add in Props, then one of Plan card's layouts: it's a slot named after the layout, its name ready to rename. */
export const AddingASlot: Story = {
  loaders: [inspecting("design", () => ({ design: design("Plan card") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const add = await panel.findByRole("button", { name: "Add a prop" }, slowly)
    add.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Features" }, slowly))
    await expect(await panel.findByRole("textbox", { name: "features slot name" }, slowly)).toHaveFocus()
  }
}

/** Add in Props, then Text: a row to name it, and Enter adds `subtitle`, a text prop with a default to change. */
export const AddingATextProp: Story = {
  loaders: [inspecting("design", () => ({ design: design("Plan card") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const add = await panel.findByRole("button", { name: "Add a prop" }, slowly)
    add.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Text" }, slowly))
    const name = await panel.findByRole("textbox", { name: "New text prop's name" }, slowly)
    await userEvent.type(name, "Subtitle{Enter}", typing)
    await expect(await panel.findByText("subtitle", undefined, slowly)).toBeVisible()
    await expect(panel.getByText(`subtitle="Text"`, { exact: false })).toBeVisible()
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
export const ComponentWithManyParams: Story = {
  loaders: [inspecting("design", () => ({ design: design("Project card") }))]
}

/** A component with no params and eleven states, App sidebar: every instance looks the same. */
export const ComponentWithoutParams: Story = {
  loaders: [inspecting("design", () => ({ design: design("App sidebar") }))]
}

/** A screen just switched to a component: no params yet, and not used anywhere yet. */
export const NewComponent: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Button")
      example().store.updateContainer(key, "Change design kind", (current) => ({ ...current, kind: "component" }))

      return { design: key }
    })
  ]
}

/** One of Dashboard's mode columns selected on the canvas: its row is highlighted under Modes. */
export const ModeSelected: Story = {
  loaders: [inspecting("design", () => ({ design: design("Dashboard"), mode: "mobile-light" }))]
}

/** A design shown in every mode: each mode's switch is on beside the main one. */
export const EveryModeShown: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, "Show Desktop Dark, Tablet Light and Mobile Light", (view) => ({
        ...view,
        modes: ["desktop-dark", "tablet-light", "mobile-light"]
      }))

      return { design: key }
    })
  ]
}

/** A screen that shows Mobile Light first, rather than the project's primary mode. */
export const AnotherModeFirst: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, "Show Mobile Light first", (view) => ({
        ...view,
        mode: "mobile-light",
        modes: ["desktop-light"]
      }))

      return { design: key }
    })
  ]
}

/** Looking at another state than the base: Sign in showing Wrong password, its changes listed under States. */
export const ShowingAnotherState: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, "Show Wrong password", (view) => ({
        ...view,
        state: "wrong-password",
        allStates: false
      }))

      return { design: key }
    })
  ]
}

/** A design with a very long name: the name field scrolls and the file badge truncates. */
export const LongName: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      example().store.updateContainer(key, "Rename design", (current) => ({
        ...current,
        name: "Pricing page for the enterprise launch, with annual billing and the comparison table"
      }))

      return { design: key }
    })
  ]
}

/** Find repeated parts clicked on Pricing: each part that repeats, with its copies and the params it would get. */
export const RepeatedParts: Story = {
  loaders: [inspecting("design", () => ({ design: design("Pricing") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findAllByRole("button", { name: "Extract component" }, slowly)
  }
}

/** Find repeated parts clicked on a design with nothing repeated: it says so, and how to extract a part used once. */
export const NothingRepeats: Story = {
  loaders: [inspecting("design", () => ({ design: design("Button") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findByText(/Nothing repeats/, undefined, slowly)
  }
}

/** Text on the canvas selected: its words, ready to edit, and the file they're saved in. */
export const NoteSelected: Story = {
  loaders: [
    inspecting("design", () => {
      const { store } = example()

      const note = store.addNote(store.mainPath, {
        id: "launch-note",
        text: "Launch checklist: swap the hero photo, confirm yearly prices with finance, and check the FAQ copy with legal.",
        position: { x: 0, y: -1200 }
      })

      return { note }
    })
  ]
}
