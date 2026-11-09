import { type ContainerKind, uniqueId } from "@parity-app/core"
import { designGap, detachInstancesOf, freeSpotBeside, instanceCount, kindName, turnInto } from "@parity-app/editor"
import { toast } from "sonner"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { bringIntoView, takenBounds } from "../canvas/free-space.ts"
import type { ContainerEntry } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { dropLines, frameDrops } from "./convert-to-frame.ts"
import { askToConvertToFrame } from "./ConvertToFrameDialog.tsx"
import { renameAndRecord } from "./inspector-events.ts"

export function renameDesign(session: ProjectSession, entry: ContainerEntry, name: string): void {
  const trimmed = name.trim()

  if (!trimmed || trimmed === entry.container.name) {
    return
  }

  renameAndRecord(session.store, entry.key, trimmed)
}

/**
 * Copies a design, states and all, into the same file, to the right of the original in the first free space along its
 * row, selects the copy, and brings it into view when it lands off screen.
 */
export function duplicateDesign(session: ProjectSession, entry: ContainerEntry): string {
  const { store, editor } = session
  const taken = store.getEntries().map((candidate) => candidate.container.id)
  const name = `${entry.container.name} copy`
  const id = uniqueId(name, taken)
  const bounds = editor?.getShapePageBounds(shapeIdFor(entry.key))

  const x =
    editor && bounds
      ? freeSpotBeside(bounds, takenBounds(editor)).x + entry.container.position.x - bounds.minX
      : entry.container.position.x + 1400 + designGap

  const key = store.addContainer(
    entry.path,
    { ...structuredClone(entry.container), id, name, position: { x: Math.round(x), y: entry.container.position.y } },
    `Duplicate ${kindName(entry.container.kind)}`
  )

  session.selection.set({ design: key })

  // A copy that lands off screen is brought into view (PAR-204).
  if (editor && bounds) {
    const shift = Math.round(x) - entry.container.position.x
    bringIntoView(editor, {
      minX: bounds.minX + shift,
      minY: bounds.minY,
      maxX: bounds.maxX + shift,
      maxY: bounds.maxY
    })
  }

  return key
}

/** What the toast after converting a frame to a heavier kind says next. */
const convertedHints: Record<Exclude<ContainerKind, "frame">, string> = {
  component: "Place it in screens from Components.",
  screen: "Show it in more modes from its board's menu."
}

/**
 * Converts a design to another kind, from its title's menu, the canvas's and Object menus and the inspector (PAR-545).
 * A screen and a component become each other at once. A frame becomes either at once too, dropping nothing, with a
 * toast whose Undo makes it a frame again. Becoming a frame asks first when the design would drop anything (see
 * `ConvertToFrameDialog`). Each is one undo step.
 */
export function setDesignKind(session: ProjectSession, entry: ContainerEntry, kind: ContainerKind): void {
  const { store } = session
  const from = entry.container.kind ?? "screen"

  if (kind === from) {
    return
  }

  if (kind === "frame") {
    const drops = frameDrops(
      entry.container,
      store.getEntries().map((other) => other.container),
      store.getModes()
    )

    const convert = () => convertToFrame(session, entry.key)

    if (from !== "frame" && dropLines(drops).length > 0) {
      askToConvertToFrame({ name: entry.container.name, kind: from, drops, convert })
    } else {
      convert()
    }

    return
  }

  store.updateContainer(
    entry.key,
    `Convert to ${kindName(kind)}`,
    (container) => turnInto(container, kind, store.getModes()).design
  )

  if (from === "frame") {
    toast.success(`${entry.container.name} is a ${kindName(kind)}`, {
      description: convertedHints[kind],
      action: { label: "Undo", onClick: () => store.undo() }
    })
  }
}

/**
 * A screen or component made a frame, as one undo step: it keeps its layers as its first state shows them, and every
 * instance of it the project's other designs place becomes plain layers, as Detach instance makes them, since nothing
 * can place a frame.
 */
function convertToFrame(session: ProjectSession, key: string): void {
  const { store, selection } = session
  const entry = store.getEntry(key)

  if (!entry) {
    return
  }

  const { id } = entry.container

  const placing =
    entry.container.kind === "component"
      ? store.getEntries().filter((other) => other.key !== key && instanceCount(other.container, id) > 0)
      : []

  store.updateContainers([key, ...placing.map((other) => other.key)], "Convert to frame", ([design, ...others]) => [
    turnInto(design!, "frame", store.getModes()).design,
    ...others.map((other, index) => detachInstancesOf(other, id, store.getLibrary(placing[index]!.key)))
  ])
  selection.set({ design: key })
}

export function deleteDesign(session: ProjectSession, entry: ContainerEntry): void {
  session.store.removeContainer(entry.key)
  session.selection.set({})
}
