import { type ContainerKind, type ContainerSpec, generateId, uniqueId } from "@parity-app/core"

/**
 * An empty design, ready to fill: a screen is a padded page with its name as a heading, and a component a small padded
 * layout saying Component, on a frame 480px wide in `viewport`, since it's usually smaller than a page. Its id comes
 * from its name, clear of the ids `taken`.
 */
export function newDesign(
  kind: ContainerKind,
  taken: Iterable<string>,
  position: { x: number; y: number },
  viewport?: string
): ContainerSpec {
  const name = kind === "component" ? "Untitled component" : "Untitled screen"
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  return {
    id: uniqueId(name, taken),
    name,
    kind,
    position,
    root:
      kind === "component"
        ? {
            type: "layout",
            id: rootId,
            name: "Root",
            style: { padding: 4, gap: 2 },
            children: [{ type: "text", id: generateId(ids), text: "Component" }]
          }
        : {
            type: "layout",
            id: rootId,
            name: "Page",
            style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
            children: [
              {
                type: "text",
                id: generateId(ids),
                tag: "h1",
                text: name,
                style: { size: "text-2xl", weight: 600 }
              }
            ]
          },
    states: [{ id: "default", name: "Default" }],
    ...(kind === "component" && viewport ? { frames: { [viewport]: { width: 480 } } } : {})
  }
}
