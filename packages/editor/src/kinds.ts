import {
  type CanvasDocument,
  type ContainerKind,
  type ContainerSpec,
  type DesignNode,
  frameSize,
  generateId,
  type LayoutNode,
  type ModeSettings,
  nodeIds,
  resolveModes,
  shownModes,
  snapToSpacingGrid
} from "@parity-app/core"
import type { DesignRef } from "./arrange.ts"
import { asShown, fitBindings, pasteLayers, type PasteTarget } from "./clipboard.ts"

/**
 * Turning a design into another kind, and a frame going inside another design. A frame is the light kind: a layout on
 * the canvas, drawn once at its own size in the project's primary mode, with one state and no params. Each rule takes
 * designs as data and returns them changed, for the app to apply as one undo step.
 */

/** What a design leaves behind in becoming a frame, so the app can say so before it does. Empty when nothing goes. */
export interface DroppedParts {
  /** Its states after the first. */
  states: { id: string; name: string }[]
  /** The modes its board showed other than the primary one, by id: its own main mode, then those beside it. */
  modes: string[]
  /** Its params that aren't variants, by name. */
  params: string[]
  /** Its variants, by name. */
  variants: string[]
}

/**
 * The design as another kind, with what it dropped. A screen and a component become each other by their kind alone.
 *
 * Becoming a frame, a design keeps its layers as its board showed them in its first state, with the variant options it
 * showed and each bound value as it showed, since its params and their bindings go. Responsive patches stay on the
 * layers. It drops its other states, the modes it showed beside the primary one and its sizes per viewport, and takes
 * the size it was drawn at in the primary mode as its own. A root that isn't a layout goes inside one.
 *
 * A frame made a screen or a component drops nothing: its own size becomes its frame's size in the primary viewport,
 * so it shows as it did.
 */
export function turnInto(
  design: ContainerSpec,
  kind: ContainerKind,
  modes: ModeSettings
): { design: ContainerSpec; dropped: DroppedParts } {
  const from = design.kind ?? "screen"
  const dropped: DroppedParts = { states: [], modes: [], params: [], variants: [] }
  if (from === kind) return { design, dropped }
  if (kind === "frame") return asFrame(design, modes)
  if (from !== "frame") return { design: { ...design, kind }, dropped }
  const { size, ...rest } = design
  const viewport = resolveModes(modes)[0]!.viewport
  const sized = size !== undefined && (size.width !== undefined || size.height !== undefined)
  return { design: { ...rest, kind, ...(sized ? { frames: { [viewport]: size } } : {}) }, dropped }
}

function asFrame(design: ContainerSpec, modes: ModeSettings): { design: ContainerSpec; dropped: DroppedParts } {
  const [first] = design.states
  const { main, beside, all } = shownModes(modes, design)
  const primary = all[0]!
  const shown = fitBindings(asShown(design, design.root, first), { ...design, params: undefined })
  const root: DesignNode =
    shown.type === "layout" ? shown : { type: "layout", id: generateId(nodeIds(shown)), children: [shown] }
  const params = Object.entries(design.params ?? {})
  const frame: ContainerSpec = {
    id: design.id,
    name: design.name,
    kind: "frame",
    position: design.position,
    root,
    states: [{ id: first!.id, name: first!.name }],
    size: frameSize(design, primary),
    ...(design.context ? { context: design.context } : {})
  }
  return {
    design: frame,
    dropped: {
      states: design.states.slice(1).map(({ id, name }) => ({ id, name })),
      modes: [main, ...beside].filter((mode) => mode !== primary).map((mode) => mode.id),
      params: params.filter(([, param]) => param.type !== "variant").map(([name]) => name),
      variants: params.filter(([, param]) => param.type === "variant").map(([name]) => name)
    }
  }
}

/**
 * A frame put inside another design, as a paste or a move puts it there: only a top-level design is a frame, so it
 * becomes its root layout, named after the frame, with the frame's own size as its width and height in steps of the
 * spacing scale (`unit` pixels a step), on the nearest half step as other lengths land. Its ids are the frame's.
 */
export function frameAsLayout(frame: ContainerSpec, unit: number): LayoutNode {
  const { root, size } = frame
  if (frame.kind !== "frame" || root.type !== "layout") throw new Error(`${frame.name} isn't a frame`)
  const style = { ...root.style }
  if (size?.width !== undefined) style.width = snapToSpacingGrid(size.width / unit)
  if (size?.height !== undefined) style.height = snapToSpacingGrid(size.height / unit)
  return { ...root, name: frame.name, ...(Object.keys(style).length > 0 ? { style } : {}) }
}

/**
 * Copied designs pasted inside a design rather than beside it: each frame goes in as a layout (see `frameAsLayout`),
 * with fresh ids, at `target`, in order. Undefined when one isn't a frame, since a screen or a component can't go inside
 * another design.
 */
export function pasteFramesInto(
  container: ContainerSpec,
  target: PasteTarget,
  designs: readonly ContainerSpec[],
  unit: number
): { container: ContainerSpec; copies: string[] } | undefined {
  if (!designs.every((design) => design.kind === "frame")) return undefined
  return pasteLayers(
    container,
    target,
    designs.map((design) => frameAsLayout(design, unit))
  )
}

/**
 * A frame moved into another design, as dragging its board onto one does: it goes in as a layout at `target`, with
 * fresh ids, and leaves the canvas. Returns the documents and the new layer's id. Throws, changing nothing, when either
 * design isn't in the documents, `frame` isn't a frame, or it would go into itself.
 */
export function moveFrameInto(
  documents: ReadonlyMap<string, CanvasDocument>,
  frame: DesignRef,
  into: DesignRef,
  target: PasteTarget,
  unit: number
): { documents: Map<string, CanvasDocument>; layer: string } {
  const find = (ref: DesignRef) => documents.get(ref.path)?.containers.find((design) => design.id === ref.id)
  const moving = find(frame)
  const destination = find(into)
  if (!moving || !destination) throw new Error(`No design "${moving ? into.id : frame.id}"`)
  if (moving === destination) throw new Error(`${moving.name} can't go inside itself`)
  const placed = pasteFramesInto(destination, target, [moving], unit)
  if (!placed) throw new Error(`${moving.name} isn't a frame`)
  const next = new Map(documents)
  const replace = (path: string, change: (containers: ContainerSpec[]) => ContainerSpec[]) => {
    const document = next.get(path)!
    next.set(path, { ...document, containers: change(document.containers) })
  }
  replace(into.path, (containers) => containers.map((design) => (design === destination ? placed.container : design)))
  replace(frame.path, (containers) => containers.filter((design) => design !== moving))
  return { documents: next, layer: placed.copies[0]! }
}
