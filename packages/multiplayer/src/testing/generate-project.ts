import type { CanvasDocument, ContainerSpec, DesignNode } from "@parity-app/core"

export interface ProjectSize {
  /** Designs in the project, about one in twenty of them components. */
  designs: number
  /** Layers in each screen, about. */
  layers: number
  /** How deep each screen's layers go. */
  depth: number
  /** The same seed makes the same project. */
  seed: number
}

/** The project sizes the benchmark runs on. */
export const projectSizes = {
  small: { designs: 20, layers: 100, depth: 6, seed: 1 },
  large: { designs: 100, layers: 200, depth: 8, seed: 2 },
  veryLarge: { designs: 250, layers: 400, depth: 10, seed: 3 }
} satisfies Record<string, ProjectSize>

/** Designs per file: the first file is the main one, `app.par`. */
const designsPerFile = 25

/** A project to load: screens of nested layouts with text, and instances of its components filling their slots. */
export function generateProject(size: ProjectSize): { path: string; document: CanvasDocument }[] {
  const random = seeded(size.seed)
  const components = Math.max(2, Math.round(size.designs / 20))
  const designs: ContainerSpec[] = []

  for (let index = 0; index < size.designs; index += 1) {
    const position = { x: (index % 10) * 1600, y: Math.floor(index / 10) * 1200 }

    designs.push(
      index < components
        ? component(`component-${index}`, position)
        : screen(`screen-${index}`, position, size, components, random)
    )
  }

  const files: { path: string; document: CanvasDocument }[] = []

  for (let start = 0; start < designs.length; start += designsPerFile) {
    const path = start === 0 ? "app.par" : `designs/part-${start / designsPerFile + 1}.par`
    files.push({ path, document: { version: 4, containers: designs.slice(start, start + designsPerFile) } })
  }

  return files
}

/** A text layer somewhere in a design, for typing into. */
export function firstText(container: ContainerSpec): string {
  const found = findNode(container.root, (node) => node.type === "text")

  if (!found) {
    throw new Error(`${container.id} has no text layer`)
  }

  return found.id
}

/** A layer that isn't the root, for setting fields on and dragging. */
export function firstChild(container: ContainerSpec): string {
  const root = container.root

  if (!("children" in root) || !root.children[0]) {
    throw new Error(`${container.id} has no child layer`)
  }

  return root.children[0].id
}

function component(id: string, position: { x: number; y: number }): ContainerSpec {
  return {
    id,
    name: id,
    kind: "component",
    position,
    root: {
      type: "layout",
      id: "root",
      style: { gap: { step: 2 } },
      children: [
        { type: "text", id: "label", text: "Label" },
        { type: "layout", id: "actions", slot: "actions", children: [{ type: "text", id: "hint", text: "Actions" }] }
      ]
    }
  }
}

function screen(
  id: string,
  position: { x: number; y: number },
  size: ProjectSize,
  components: number,
  random: () => number
): ContainerSpec {
  const branching = Math.max(2, Math.ceil(size.layers ** (1 / size.depth)))
  let count = 0
  const nextId = () => `n${(count += 1)}`

  const build = (depth: number): DesignNode => {
    const id = nextId()

    if (depth >= size.depth || count >= size.layers) {
      if (random() < 0.15) {
        return {
          type: "instance",
          id,
          design: `component-${Math.floor(random() * components)}`,
          slots: { actions: [{ type: "text", id: nextId(), text: "Go" }] }
        }
      }

      return { type: "text", id, text: words(random), style: { fontWeight: { value: 400 } } }
    }

    const children: DesignNode[] = []

    for (let child = 0; child < branching && count < size.layers; child += 1) {
      children.push(build(depth + 1))
    }

    return { type: "layout", id, style: { gap: { step: 1 + Math.floor(random() * 4) } }, children }
  }

  // The root is a layout with at least one layer inside, whatever the size.
  const root = build(0)

  if (root.type !== "layout") {
    throw new Error("A screen needs room for more than one layer")
  }

  return { id, name: id, kind: "screen", position, root }
}

function findNode(node: DesignNode, test: (node: DesignNode) => boolean): DesignNode | undefined {
  if (test(node)) {
    return node
  }

  for (const child of "children" in node ? node.children : []) {
    const found = findNode(child, test)

    if (found) {
      return found
    }
  }

  return undefined
}

const vocabulary = ["plan", "price", "team", "settings", "billing", "profile", "invite", "usage", "export", "search"]

function words(random: () => number): string {
  const count = 1 + Math.floor(random() * 4)

  return Array.from({ length: count }, () => vocabulary[Math.floor(random() * vocabulary.length)]).join(" ")
}

/** Park and Miller's generator: small, and the same on every machine. */
function seeded(seed: number): () => number {
  const modulus = 2_147_483_647
  let state = (seed % (modulus - 1)) + 1

  return () => {
    state = (state * 48_271) % modulus

    return (state - 1) / (modulus - 1)
  }
}
