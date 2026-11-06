import { addVariant, type ContainerSpec, type DesignNode, editNode } from "@parity-app/core"
import { designsSelection, layersSelection, newDesign } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { design, example, findTooltip, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { formatKeys } from "./keys.ts"
import { renameLayer } from "./LayerPanel.tsx"
import { LayerTree } from "./LayerTree.tsx"
import { LeftPanel } from "./LeftPanel.tsx"

/**
 * The Layers tab: every design in the project as a tree, component designs then screens, each open to its layers.
 * Shown in the left panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Layers",
  component: LayerTree,
  render: () => <LeftPanel />,
  decorators: [
    (Story, { parameters }) =>
      parameters.blank ? (
        <ProjectStage project="designless">
          <Story />
        </ProjectStage>
      ) : (
        <ProjectStage>
          <Story />
        </ProjectStage>
      )
  ]
} satisfies Meta<typeof LayerTree>

export default meta
type Story = StoryObj<typeof meta>

/** The Layers panel's row for a design, or for one of its layers. */
function row(designName: string, layerName?: string): HTMLElement {
  const key = design(designName)
  const id = layerName ? `layer-${key}/${node(designName, layerName)}` : `layer-${key}`
  const element = document.getElementById(id)
  if (!element) throw new Error(`The Layers panel shows no row for ${layerName ?? designName}`)
  return element
}

/** Waits for a row to show, then scrolls the panel to it, as someone would scroll to what they selected. */
async function scrollTo(designName: string, layerName?: string): Promise<HTMLElement> {
  const found = await waitFor(() => row(designName, layerName))
  found.scrollIntoView({ block: "center" })
  return found
}

/** Selects each layer in turn, as clicking them on the canvas would, so the tree opens up to every one of them. */
async function reveal(designName: string, ...layerNames: string[]): Promise<void> {
  for (const name of layerNames) {
    example().selection.set({ design: design(designName), node: node(designName, name) })
    await waitFor(() => row(designName, name))
  }
}

/**
 * Drags layers over a row, as far down it as `at` says (0 is its top edge, 1 its bottom), and leaves them there, so
 * the panel shows where they'd land.
 */
function dragOver(target: HTMLElement, designName: string, layerNames: string[], at: number): void {
  const data = new DataTransfer()
  const ids = layerNames.map((name) => node(designName, name))
  data.setData("application/x-parity-layers", JSON.stringify({ design: design(designName), ids }))
  const box = target.getBoundingClientRect()
  target.dispatchEvent(
    new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height * at
    })
  )
}

/**
 * Searches the panel, as typing would. `userEvent.type` changes the field without React's change handler seeing it,
 * so the value is set the way React reads it, as the Components panel's stories do.
 */
async function search(canvasElement: HTMLElement, text: string): Promise<void> {
  const field = within(canvasElement).getByRole("textbox", { name: "Search layers" })
  field.focus()
  await fireEvent.input(field, { target: { value: text } })
}

/** Right-clicks a row where it is, as a person would, so its menu opens beside it. */
async function rightClick(target: HTMLElement): Promise<void> {
  const box = target.getBoundingClientRect()
  await fireEvent.contextMenu(target, { clientX: box.left + 48, clientY: box.bottom - 4 })
}

/**
 * Every design closed: component designs first, then screens, each with how many states it has. Each heading has its
 * count, then a + that makes a new one, always showing (PAR-546).
 */
export const Designs: Story = { loaders: [() => openProjects("example")] }

/**
 * A project whose designs were all deleted: each heading's + shows, the count is left out since the row below says so,
 * and that row is a button that makes the first one, its action in the kind's color.
 */
export const EmptyProject: Story = {
  parameters: { blank: true },
  loaders: [() => openProjects("designless")],
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement).getByRole("tree", { name: "Layers" })
    await expect(within(tree).getByRole("button", { name: "New screen" })).toBeVisible()
    await expect(within(tree).getByRole("button", { name: "No screens yet. New screen" })).toBeVisible()
    await expect(within(tree).getByRole("button", { name: "No components yet. New component" })).toBeVisible()
  }
}

/**
 * The Screens heading's + under the pointer: its tooltip names it and gives its keys. Tabbing to it shows the same
 * tooltip; a story can't, as Base UI opens one on focus only when the browser shows focus, and a script's focus doesn't
 * count.
 */
export const NewScreenHovered: Story = {
  parameters: { blank: true },
  loaders: [() => openProjects("designless")],
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement).getByRole("tree", { name: "Layers" })
    await userEvent.hover(within(tree).getByRole("button", { name: "New screen" }))
    await expect(await findTooltip({ timeout: 8000 })).toHaveTextContent(`New screen ${formatKeys("Ctrl Alt N")}`)
  }
}

/**
 * An empty group's row pressed: the first screen is made and selected, and listed under Screens in place of the row,
 * with the count back beside the +.
 */
export const FirstScreenMade: Story = {
  parameters: { blank: true },
  loaders: [() => openProjects("designless")],
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement).getByRole("tree", { name: "Layers" })
    await userEvent.click(within(tree).getByRole("button", { name: "No screens yet. New screen" }))
    // The screen's row, then the heading inside it, which reads the same.
    const [screen] = await within(tree).findAllByRole("treeitem", { name: /Untitled screen/ })
    await expect(screen).toHaveAttribute("aria-level", "1")
    await expect(screen).toHaveAttribute("aria-selected", "true")
    await expect(within(tree).queryByRole("button", { name: "No screens yet. New screen" })).toBeNull()
  }
}

/** A design opened by its arrow, then its page: its first level of layers shows, and nothing is selected. */
export const DesignExpanded: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    const card = row("Plan card")
    await fireEvent.click(within(card).getByRole("button", { name: "Expand" }))
    const root = await waitFor(() => row("Plan card", "Plan card"))
    await fireEvent.click(within(root).getByRole("button", { name: "Expand" }))
    await waitFor(() => row("Plan card", "CardContent"))
  }
}

/**
 * One layer selected, deep inside its design: the design and every layer above it open, guides mark each level, and
 * the row is highlighted with a bar in its kind's color.
 */
export const LayerSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Plan card"), node: node("Plan card", "Feature 3 text") })
    }
  ]
}

/** Three layers of one design selected together, as Ctrl-click or Shift-click in the tree selects them. */
export const SeveralLayersSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const card = design("Plan card")
      const layers = ["Feature 1", "Feature 2", "Feature 3"].map((name) => node("Plan card", name))
      example().selection.set(layersSelection(card, layers))
    }
  ]
}

/** Three designs selected together; the one picked last is open. */
export const SeveralDesignsSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set(designsSelection([design("Stat card"), design("Plan card"), design("Activity item")]))
    }
  ]
}

/**
 * A layer hovered on the canvas, highlighted lightly in the tree, below a selected one. Selected and hovered rows
 * look different.
 */
export const Hovered: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const card = design("Plan card")
      example().selection.set({ design: card, node: node("Plan card", "Price row") })
      example().selection.setHover({ design: card, node: node("Plan card", "Billing") })
    }
  ]
}

/** Layers hidden in the design: muted, with a crossed-out eye. Nothing is selected. */
export const HiddenLayers: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Stat card", "Value skeleton", "Note skeleton")
    example().selection.set({})
  }
}

/**
 * The Stat card showing its Loading state: a pen marks each layer that state changes. Its skeletons show in Loading,
 * yet their rows still look hidden, since the tree reads the base design's visibility.
 */
export const ShowingAState: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const card = design("Stat card")
      example().store.updateView(card, "Show Loading", (view) => ({ ...view, state: "loading" }))
    }
  ],
  play: async () => {
    await reveal("Stat card", "Note skeleton", "Value")
  }
}

/**
 * The Pricing screen's plan cards, instances of the Plan card component design, marked with a diamond. A phone marks
 * layers that change on some viewports.
 */
export const Instances: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Pricing"), node: node("Pricing", "Pro plan") })
    }
  ],
  play: async () => {
    await scrollTo("Pricing", "Pro plan")
  }
}

/**
 * A layer of a screen selected on the canvas, below the component designs: the tree opens to it and scrolls just far
 * enough to show it. Selecting in the tree itself never scrolls it.
 */
export const SelectedOnCanvas: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Pricing"), node: node("Pricing", "Headline") })
    }
  ]
}

/** Renaming a layer in place, as Edit > Rename or F2 starts it: its name is selected, ready to type over. */
export const RenamingALayer: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Plan card"), node: node("Plan card", "Call to action") })
    }
  ],
  play: async ({ canvasElement }) => {
    example().selection.requestRename()
    const field = await within(canvasElement).findByDisplayValue("Call to action")
    await waitFor(() => expect(field).toHaveFocus())
  }
}

/** Renaming a design from its row, as double-clicking it starts. */
export const RenamingADesign: Story = {
  loaders: [() => openProjects("example")],
  play: async ({ canvasElement }) => {
    await fireEvent.doubleClick(row("Plan card"))
    await within(canvasElement).findByDisplayValue("Plan card")
  }
}

/** A design and a layer with very long names: both are cut short with an ellipsis rather than wrapping. */
export const LongNames: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const { store, selection } = example()
      const card = design("Plan card")
      const third = node("Plan card", "Feature 3 text")
      store.updateContainer(card, "Rename design", (container) => ({
        ...container,
        name: "Plan card for the enterprise tier, with annual billing and a seat-based discount"
      }))
      store.updateContainer(card, "Rename layer", (container) =>
        renameLayer(container, third, "Third feature of the plan, as marketing wrote it for the launch page")
      )
      selection.set({ design: card, node: third })
    }
  ]
}

/**
 * A hidden layer's menu, opened by right-clicking its row, which selects it first: rename, duplicate, show it again or
 * delete it, each with its keys from the keymap (PAR-571).
 */
export const LayerMenu: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Stat card", "Value skeleton")
    example().selection.set({ design: design("Stat card") })
    await rightClick(row("Stat card", "Value skeleton"))
    const menu = await within(document.body).findByRole("menu")
    await expect(row("Stat card", "Value skeleton")).toHaveAttribute("aria-selected", "true")
    const items = within(menu).getAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      `Rename${formatKeys("Ctrl R")}`,
      `Duplicate${formatKeys("Ctrl D")}`,
      `Show in Default${formatKeys("Ctrl Shift H")}`,
      `Delete${formatKeys("Del")}`
    ])
  }
}

/**
 * Plan card with a density variant whose Compact option hides Feature 4, shown on its board. Feature 4's menu offers
 * Show in Compact, where the change lands, rather than in the base state (PAR-497).
 */
export const HiddenByAVariant: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const card = design("Plan card")
      const feature = node("Plan card", "Feature 4")
      example().store.updateContainer(card, "Add density variant", (current) => {
        const added = addVariant(current, "density", ["Comfortable", "Compact"])
        const compact = added.params!.density!.options![1]!.id
        const hidden = editNode(
          added,
          { state: added.states[0]!.id, variant: { param: "density", option: compact } },
          feature,
          {
            hidden: true
          }
        )
        return { ...hidden, view: { ...hidden.view, variants: { density: compact } } }
      })
    }
  ],
  play: async () => {
    await reveal("Plan card", "Feature 4")
    await rightClick(row("Plan card", "Feature 4"))
    await within(document.body).findByRole("menuitem", { name: "Show in Compact" })
  }
}

/** A design's menu, opened by right-clicking its row, which selects it: rename, duplicate or delete it. */
export const DesignMenu: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await rightClick(row("Plan card"))
    const menu = await within(document.body).findByRole("menu")
    await expect(row("Plan card")).toHaveAttribute("aria-selected", "true")
    await expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual([`Rename${formatKeys("Ctrl R")}`, `Duplicate${formatKeys("Ctrl D")}`, `Delete${formatKeys("Del")}`])
  }
}

/** Dragging the selected Feature 4 up the tree: a line under Feature 2 shows it would land after it. */
export const DraggingBetweenLayers: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Plan card", "Feature 4")
    dragOver(row("Plan card", "Feature 2"), "Plan card", ["Feature 4"], 0.9)
  }
}

/** Dragging a layer onto a layout: a ring around the layout's row shows it would go inside, at the end. */
export const DraggingIntoALayout: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Plan card", "Price row")
    dragOver(row("Plan card", "Price block"), "Plan card", ["Call to action"], 0.5)
  }
}

/**
 * The Pricing screen dragged over the bottom half of Dashboard's row: a line under Dashboard, in the screen color,
 * shows it would be listed after it (PAR-187).
 */
export const DraggingADesign: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    const data = new DataTransfer()
    row("Pricing").dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }))
    const target = await waitFor(() => row("Dashboard"))
    const box = target.getBoundingClientRect()
    target.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height * 0.9
      })
    )
  }
}

/**
 * Searching for "feature": Plan card's four features and their texts, with the rows above them open, and nothing else.
 * Its arrows are gone, since a search opens what it finds (PAR-187).
 */
export const Searching: Story = {
  loaders: [() => openProjects("example")],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "feature")
    await waitFor(() => row("Plan card", "Feature 4"))
    await expect(row("Plan card")).toHaveAttribute("aria-expanded", "true")
    await expect(document.getElementById(`layer-${design("Dashboard")}`)).toBeNull()
  }
}

/** A search that finds nothing says so, in place of the tree. */
export const NothingFound: Story = {
  loaders: [() => openProjects("example")],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "carousel")
    await within(canvasElement).findByText("No layers or designs match “carousel”")
  }
}

/** Collapse all, pressed with a layer deep in Plan card selected: every row closes, the selection's too (PAR-187). */
export const CollapsedAll: Story = {
  loaders: [() => openProjects("example")],
  play: async ({ canvasElement }) => {
    await reveal("Plan card", "Feature 3 text")
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Collapse all" }))
    await waitFor(() => expect(row("Plan card")).toHaveAttribute("aria-expanded", "false"))
  }
}

/**
 * Plan card's Feature 3 text selected on the canvas, then Pricing's headline: the rows opened for the feature close,
 * and only Pricing's open, so the tree doesn't grow as the selection moves around the project (PAR-187).
 */
export const SelectionMovedOn: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Plan card", "Feature 3 text")
    example().selection.set({ design: design("Pricing"), node: node("Pricing", "Headline") })
    await waitFor(() => expect(row("Plan card")).toHaveAttribute("aria-expanded", "false"))
    await expect(row("Pricing")).toHaveAttribute("aria-expanded", "true")
  }
}

/**
 * Feature 2 hovered, then hidden from its eye, which leaves the selection as it was: its eye is crossed out, and stays
 * while the pointer is elsewhere, as Value skeleton's does (PAR-187).
 */
export const HiddenFromItsEye: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Plan card", "Feature 2")
    example().selection.set({ design: design("Plan card") })
    await userEvent.hover(row("Plan card", "Feature 2"))
    await userEvent.click(await within(row("Plan card", "Feature 2")).findByRole("button", { name: "Hide in Default" }))
    await userEvent.unhover(row("Plan card", "Feature 2"))
    await within(row("Plan card", "Feature 2")).findByRole("button", { name: "Show in Default" })
    await expect(example().selection.get()).toEqual({ design: design("Plan card") })
  }
}

/** Free text on the canvas, listed after the designs; the selected one is highlighted. */
export const TextOnTheCanvas: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const { store, selection } = example()
      store.addNote(store.mainPath, {
        id: "note-launch",
        text: "Launch checklist: pricing copy signed off by Friday",
        position: { x: 0, y: -1600 }
      })
      const note = store.addNote(store.mainPath, {
        id: "note-review",
        text: "Review the empty states with design before handoff",
        position: { x: 0, y: -1400 }
      })
      selection.set({ note })
    }
  ],
  play: async ({ canvasElement }) => {
    const note = await within(canvasElement).findByText("Review the empty states with design before handoff")
    note.scrollIntoView({ block: "center" })
  }
}

/**
 * A screen of 6,050 layers, 50 sections of 30 rows of three texts, listed after 100 other screens, with a row deep in
 * its 40th section selected. Only the rows in view are drawn, so the panel stays as quick as it is for a small project.
 */
export const LargeProject: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      const { store, selection } = example()
      for (let index = 0; index < 100; index++) {
        const taken = store.getEntries().map((entry) => entry.container.id)
        const screen = newDesign("screen", taken, { x: index * 400, y: 6000 })
        store.addContainer(store.mainPath, { ...screen, name: `Screen ${index + 1}` })
      }
      const taken = store.getEntries().map((entry) => entry.container.id)
      const key = store.addContainer(store.mainPath, largeScreen(taken))
      selection.set({ design: key, node: "large-40-15-title" })
    }
  ]
}

/** A screen of 50 sections, each of 30 rows of a title, a detail and a note: 6,050 layers in all. */
function largeScreen(taken: string[]): ContainerSpec {
  const screen = newDesign("screen", taken, { x: 0, y: 4000 })
  const text = (id: string, value: string): DesignNode => ({ type: "text", id, text: value })
  const sections = Array.from({ length: 50 }, (_, section): DesignNode => ({
    type: "layout",
    id: `large-${section + 1}`,
    name: `Section ${section + 1}`,
    children: Array.from({ length: 30 }, (_, index): DesignNode => ({
      type: "layout",
      id: `large-${section + 1}-${index + 1}`,
      name: `Row ${section + 1}.${index + 1}`,
      style: { direction: "row" },
      children: [
        text(`large-${section + 1}-${index + 1}-title`, `Title ${section + 1}.${index + 1}`),
        text(`large-${section + 1}-${index + 1}-detail`, `Detail ${section + 1}.${index + 1}`),
        text(`large-${section + 1}-${index + 1}-note`, "Note")
      ]
    }))
  }))
  const root = screen.root.type === "layout" ? { ...screen.root, children: sections } : screen.root
  return { ...screen, name: "Large list", root }
}

/** A design file that couldn't be read, with the reason, after everything that could. */
export const UnreadableFile: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().errors.push({
        path: "designs/marketing.par",
        error: "Unexpected token '}' in JSON at position 18412 (line 640, column 3)"
      })
    }
  ],
  play: async ({ canvasElement }) => {
    const file = await within(canvasElement).findByText("designs/marketing.par")
    file.scrollIntoView({ block: "center" })
  }
}
