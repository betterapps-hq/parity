import {
  type ContainerKind,
  type ContainerSpec,
  type DesignNode,
  type FrameSize,
  generateId,
  uniqueId
} from "@parity-app/core"

export interface NewDesignOptions {
  /** The project's first viewport, which a new component's narrower frame is sized in. */
  viewport?: string
  /** A new frame's own size; without one it's as wide as the primary mode's viewport and as tall as its content. */
  size?: FrameSize
}

/**
 * An empty design, ready to fill: a screen is a padded page with its name as a heading, a component a small padded
 * layout saying Component, on a frame 480px wide in `viewport`, since it's usually smaller than a page, and a frame an
 * empty layout, padded as a pasted design is, at its own `size`. Its id comes from its name, clear of the ids `taken`.
 */
export function newDesign(
  kind: ContainerKind,
  taken: Iterable<string>,
  position: { x: number; y: number },
  { viewport, size }: NewDesignOptions = {}
): ContainerSpec {
  const name = { screen: "Untitled screen", component: "Untitled component", frame: "Untitled frame" }[kind]
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)

  const roots: Record<ContainerKind, DesignNode> = {
    screen: {
      type: "layout",
      id: rootId,
      name: "Page",
      style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
      children: [{ type: "text", id: generateId(ids), tag: "h1", text: name, style: { size: "text-2xl", weight: 600 } }]
    },
    component: {
      type: "layout",
      id: rootId,
      name: "Root",
      style: { padding: 4, gap: 2 },
      children: [{ type: "text", id: generateId(ids), text: "Component" }]
    },
    frame: {
      type: "layout",
      id: rootId,
      style: { padding: 6, gap: 4, background: "background", foreground: "foreground" },
      children: []
    }
  }

  return {
    id: uniqueId(name, taken),
    name,
    kind,
    position,
    root: roots[kind],
    states: [{ id: "default", name: "Default" }],
    ...(kind === "component" && viewport ? { frames: { [viewport]: { width: 480 } } } : {}),
    ...(kind === "frame" && size ? { size } : {})
  }
}
