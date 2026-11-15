import { type MadeKind, designId } from "@parity-app/core"
import { designGap, detachInstancesOf, freeSpotBeside, instanceCount, kindName, turnInto } from "@parity-app/editor"
import {
  addContainer,
  type ContainerEntry,
  containerEntries,
  containerEntry,
  type ProjectDoc,
  removeContainer,
  updateContainer,
  updateContainers
} from "@parity-app/multiplayer"
import { toast } from "sonner"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import { bringIntoView, takenBounds } from "../canvas/free-space.ts"
import { libraryOf, undo } from "../project-doc.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { droppedStatesLine, dropLines, frameDrops } from "./convert-to-frame.ts"
import { askToConvertToFrame } from "./ConvertToFrameDialog.tsx"
import { renameAndRecord } from "./inspector-events.ts"

export function renameDesign(doc: ProjectDoc, entry: ContainerEntry, name: string): void {
  const trimmed = name.trim()

  if (!trimmed || trimmed === entry.container.name) {
    return
  }

  renameAndRecord(doc, entry.key, trimmed)
}

/**
 * Copies a design, states and all, into the same file, to the right of the original in the first free space along its
 * row, selects the copy, and brings it into view when it lands off screen.
 */
export function duplicateDesign(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  entry: ContainerEntry
): string {
  const { doc, editor } = session
  const taken = containerEntries(doc).map((candidate) => candidate.container.id)
  const name = `${entry.container.name} copy`
  const id = designId(name, taken)
  const bounds = editor?.getShapePageBounds(canvasIdFor(entry.key))

  const x =
    editor && bounds
      ? freeSpotBeside(bounds, takenBounds(editor)).x + entry.container.position.x - bounds.minX
      : entry.container.position.x + 1400 + designGap

  const key = addContainer(
    doc,
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
const convertedHints: Record<Exclude<MadeKind, "frame">, string> = {
  component: "Place it in screens from Components.",
  screen: "Show it in more modes from its board's menu."
}

/**
 * Converts a design to another kind, from its title's menu, the canvas's and Object menus and the inspector (PAR-545).
 * A screen and a component become each other at once. A frame becomes either at once too, dropping nothing, with a
 * toast whose Undo makes it a frame again. Becoming a frame asks first when the design would drop anything (see
 * `ConvertToFrameDialog`). Each is one undo step.
 */
export function setDesignKind(session: ProjectDesigns, entry: ContainerEntry, kind: MadeKind): void {
  const { doc } = session
  const from = entry.container.kind ?? "screen"

  // A story is its tool's file of stories, so it isn't made into anything else.
  if (kind === from || from === "story") {
    return
  }

  if (kind === "frame") {
    const drops = frameDrops(
      entry.container,
      containerEntries(doc).map((other) => other.container),
      doc.modes()
    )

    const convert = () => convertToFrame(session, entry.key)

    if (from !== "frame" && dropLines(drops).length > 0) {
      askToConvertToFrame({ name: entry.container.name, kind: from, drops, convert })
    } else {
      convert()
    }

    return
  }

  const { dropped } = turnInto(entry.container, kind, doc.modes())

  updateContainer(
    doc,
    entry.key,
    `Convert to ${kindName(kind)}`,
    (container) => turnInto(container, kind, doc.modes()).design
  )

  // Only a component has states, so a component made a screen keeps its first state's look and loses the others.
  if (dropped.states.length > 0) {
    toast.success(`${entry.container.name} is a ${kindName(kind)}`, {
      description: droppedStatesLine(dropped.states.map((state) => state.name)),
      action: { label: "Undo", onClick: () => undo(session) }
    })
  }

  if (from === "frame") {
    toast.success(`${entry.container.name} is a ${kindName(kind)}`, {
      description: convertedHints[kind],
      action: { label: "Undo", onClick: () => undo(session) }
    })
  }
}

/**
 * A screen or component made a frame, as one undo step: it keeps its layers as its first state shows them, and every
 * instance of it the project's other designs place becomes plain layers, as Detach instance makes them, since nothing
 * can place a frame.
 */
function convertToFrame(session: ProjectDesigns, key: string): void {
  const { doc, selection } = session
  const entry = containerEntry(doc, key)

  if (!entry) {
    return
  }

  const { id } = entry.container

  const placing =
    entry.container.kind === "component"
      ? containerEntries(doc).filter((other) => other.key !== key && instanceCount(other.container, id) > 0)
      : []

  updateContainers(doc, [key, ...placing.map((other) => other.key)], "Convert to frame", ([design, ...others]) => [
    turnInto(design!, "frame", doc.modes()).design,
    ...others.map((other, index) => detachInstancesOf(other, id, libraryOf(session, placing[index]!.key)))
  ])
  selection.set({ design: key })
}

export function deleteDesign(session: ProjectDesigns, entry: ContainerEntry): void {
  removeContainer(session.doc, entry.key)
  session.selection.set({})
}
