import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { layersSelection, type Selection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { items, keysOf } from "./canvas-menu-stories.tsx"
import type { MenuTarget } from "./canvas-menu.ts"
import { CanvasMenuItems } from "./CanvasMenu.tsx"
import { formatKeys } from "./keys.ts"

/**
 * The canvas's right-click menu on its own, open for a selection and the layers under the pointer, as a right-click
 * leaves them. Over a design it lists what can be done with the selection, in the order Figma's does, each item with
 * its keys; around the designs it's short. With no canvas here, Zoom to fit is unavailable. What a right-click on the
 * canvas selects first is in Canvas menu/Right-click.
 */
const meta = {
  title: "Parity/Chrome/Canvas menu/Items",
  component: CanvasMenuItems
} satisfies Meta<typeof CanvasMenuItems>

export default meta

const body = () => within(document.body)

type Story = StoryObj<typeof meta>

/** The menu, open, for what's under the pointer: `target`, read once the project is ready. */
function OpenMenu({ target }: { target: () => MenuTarget | undefined }) {
  return (
    <ProjectStage>
      <ContextMenu open>
        <ContextMenuTrigger render={<div className="size-full" />} />
        <ContextMenuContent className="min-w-60 [&_[role=menuitem]]:whitespace-nowrap" aria-label="Canvas">
          <CanvasMenuItems opened={{ point: { x: 0, y: 0 }, target: target() }} />
        </ContextMenuContent>
      </ContextMenu>
    </ProjectStage>
  )
}

/** Over `layers` of a design, outermost first, its root under them all. */
function over(designName: string, layers: readonly string[] = []): () => MenuTarget {
  return () => {
    const key = design(designName)
    const root = example().store.getEntry(key)!.container.root.id

    return { design: key, path: [root, ...layers.map((layer) => node(designName, layer))] }
  }
}

/** A story of the menu open over `target` with `selection` made, then `check` on what it lists. */
function menuFor(
  target: () => MenuTarget | undefined,
  selection?: () => Selection,
  check?: (menu: HTMLElement) => Promise<void>
): Story {
  return {
    args: { opened: { point: { x: 0, y: 0 } } },
    loaders: [
      async () => {
        await openProjects("example")

        if (selection) {
          example().selection.set(selection())
        }
      }
    ],
    render: () => <OpenMenu target={target} />,
    play: async () => {
      await check?.(await body().findByRole("menu", { name: "Canvas" }))
    }
  }
}

/** One layer selected: the menu acts on it, each item with its keys from the keymap. */
export const OneLayer = menuFor(
  over("Pricing", ["Hero", "Headline"]),
  () => layersSelection(design("Pricing"), [node("Pricing", "Hero")]),
  async (menu) => {
    await expect(items(menu)).toEqual([
      "Select layer",
      "---",
      "Copy",
      "Copy as PNG",
      "Paste here",
      "Paste over selection",
      "Paste to replace",
      "Duplicate",
      "---",
      "Bring to front",
      "Bring forward",
      "Send backward",
      "Send to back",
      "---",
      "Wrap in layout",
      "Make component",
      "---",
      "Hide",
      "Lock",
      "---",
      "Export…"
    ])
    await expect(keysOf(menu, "Copy")).toBe(formatKeys("Ctrl C"))
    await expect(keysOf(menu, "Paste to replace")).toBe(formatKeys("Ctrl Shift R"))
    await expect(keysOf(menu, "Paste here")).toBeUndefined()
    await expect(keysOf(menu, "Export…")).toBe(formatKeys("Ctrl Shift E"))
  }
)

/** An instance selected: the menu goes to its component. */
export const Instance = menuFor(
  over("Pricing", ["Plans area", "Plans", "Pro plan"]),
  () => layersSelection(design("Pricing"), [node("Pricing", "Pro plan")]),
  async (menu) => {
    await expect(items(menu)).toContain("Go to Plan card")
  }
)

/** Several layers selected: what acts on one layer is unavailable. */
export const SeveralLayers = menuFor(
  over("Pricing", ["Hero", "Lede"]),
  () =>
    layersSelection(design("Pricing"), [
      node("Pricing", "Headline"),
      node("Pricing", "Lede"),
      node("Pricing", "Billing period")
    ]),
  async (menu) => {
    await expect(items(menu)).toEqual(
      expect.arrayContaining(["Wrap in layout", "Bring forward (unavailable)", "Make component (unavailable)"])
    )
  }
)

/** A design selected: what acts on layers is left out. */
export const Design = menuFor(
  over("Pricing", ["Hero", "Headline"]),
  () => ({ design: design("Pricing") }),
  async (menu) => {
    await expect(items(menu)).toEqual([
      "Select layer",
      "---",
      "Copy",
      "Copy as PNG",
      "Paste here",
      "Paste over selection",
      "Duplicate",
      "---",
      "Convert to component",
      "---",
      "Lock",
      "---",
      "Find references…",
      "Export…"
    ])
  }
)

/**
 * Around the designs: New screen and New component, made where it was right-clicked, Insert and Find references, each
 * with its keys (PAR-546); then pasting there; then selecting everything and fitting it all in view.
 */
export const AroundTheDesigns = menuFor(
  () => undefined,
  undefined,
  async (menu) => {
    await expect(items(menu).slice(0, 5)).toEqual([
      "New screen",
      "New component",
      "Insert…",
      expect.stringMatching(/^Find references…/),
      "---"
    ])
    await expect(keysOf(menu, "New screen")).toBe(formatKeys("Ctrl Alt N"))
    await expect(keysOf(menu, "New component")).toBe(formatKeys("Ctrl Alt Shift N"))
  }
)
