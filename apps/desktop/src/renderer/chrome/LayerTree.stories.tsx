import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, waitFor, within } from "storybook/test"
import { designsSelection, layersSelection } from "../selection.ts"
import { design, example, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
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
        <ProjectStage project="empty">
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

/** Right-clicks a row where it is, as a person would, so its menu opens beside it. */
async function rightClick(target: HTMLElement): Promise<void> {
  const box = target.getBoundingClientRect()
  await fireEvent.contextMenu(target, { clientX: box.left + 48, clientY: box.bottom - 4 })
}

/** Every design closed: component designs first, then screens, each with how many states it has. */
export const Designs: Story = { loaders: [() => openProjects("example")] }

/** A project with no designs yet: both groups say so. */
export const EmptyProject: Story = {
  parameters: { blank: true },
  loaders: [() => openProjects("empty")]
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
      example().store.updateView(card, (view) => ({ ...view, state: "loading" }))
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

/** A hidden layer's menu, opened by right-clicking its row: rename, show it again, duplicate or delete it. */
export const LayerMenu: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await reveal("Stat card", "Value skeleton")
    await rightClick(row("Stat card", "Value skeleton"))
    await within(document.body).findByRole("menu")
  }
}

/** A design's menu, opened by right-clicking its row: rename or delete it. */
export const DesignMenu: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await rightClick(row("Plan card"))
    await within(document.body).findByRole("menu")
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
