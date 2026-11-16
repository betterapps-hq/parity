import {
  type Arrow,
  type Drawn,
  flowOf,
  type LayersNudge,
  nudgedPosition,
  nudgeLayers,
  selectedDesigns,
  selectedNodes,
  selectionKey
} from "@parity-app/editor"
import {
  designsLabel,
  editFrame,
  type ProjectDoc,
  updateContainer,
  updateContainers,
  updateNote,
  updateReference
} from "@parity-app/multiplayer"
import { findNodeElement, flowingBoxes } from "../frame.ts"
import { type SelectionStore } from "../selection.ts"
import { frameGeometry } from "./frame-geometry.ts"
import { GestureRun } from "./gesture.ts"
import { selectionFrame } from "./hit.ts"
import { insetSteps } from "./layer-measure.ts"

/**
 * The arrow keys, through the keymap: the selection nudged by `@parity-app/editor`'s rules (`nudgeLayers`,
 * `nudgedPosition`), with what they read from the frame the selection was picked in. Each run of presses is one undo
 * step.
 */

/** What the arrows act on, and what they read from the frame the selection was picked in. */
export interface NudgeSession {
  doc: ProjectDoc
  selection: SelectionStore
  /** Pixels in a step of the spacing scale, which insets are kept in. */
  unit: number
  drawn?(design: string): Drawn
}

const nothingDrawn: Drawn = { flow: () => undefined, insets: () => undefined }

/**
 * Nudges what's selected: layers, designs or a text note. A run of presses is one undo step (see `runGesture`).
 * Returns what couldn't move, if anything.
 */
export function nudgeSelection(session: NudgeSession, arrow: Arrow, big: boolean): LayersNudge["blocked"] {
  const { doc, selection } = session
  const current = selection.get()
  const gesture = runGesture(doc, selection)
  const layers = selectedNodes(current)
  const frame = editFrame(doc, current)

  if (frame && layers.length > 0) {
    let blocked: LayersNudge["blocked"]
    updateContainer(
      doc,
      frame.design,
      layers.length === 1 ? "Nudge layer" : `Nudge ${layers.length} layers`,
      (container) => {
        const drawn = session.drawn?.(frame.design) ?? nothingDrawn
        const result = nudgeLayers(container, layers, frame.state, arrow, big, session.unit, drawn, frame.viewport)
        blocked = result.blocked

        return result.container
      },
      { gesture }
    )

    return blocked
  }

  // A mode column moves with its design.
  const designs = current.mode && current.design ? [current.design] : selectedDesigns(current)

  if (designs.length > 0) {
    updateContainers(
      doc,
      designs,
      `Nudge ${designsLabel(doc, designs)}`,
      (containers) =>
        containers.map((container) => ({ ...container, position: nudgedPosition(container.position, arrow, big) })),
      { gesture }
    )
  } else if (current.note) {
    updateNote(
      doc,
      current.note,
      "Nudge text",
      (note) => ({ ...note, position: nudgedPosition(note.position, arrow, big) }),
      {
        gesture
      }
    )
  } else if (current.reference) {
    updateReference(
      doc,
      current.reference,
      "Nudge reference",
      (reference) => ({ ...reference, position: nudgedPosition(reference.position, arrow, big) }),
      { gesture }
    )
  }

  return undefined
}

/** Each document's run of arrow presses, keyed by what it nudges (see `GestureRun`). */
const runs = new WeakMap<ProjectDoc, GestureRun>()

/**
 * The gesture a press nudging what's selected is in. A run of presses on one selection is one gesture, however long it
 * takes, and however often the same selection is set again meanwhile. Selecting something else ends it as it happens,
 * and so does any other change, an undo or a redo, since a gesture only adds to the latest undo step (see
 * `ProjectDoc`'s gestures in `@parity-app/multiplayer`).
 */
function runGesture(doc: ProjectDoc, selection: SelectionStore): string {
  const run = runs.get(doc) ?? new GestureRun(doc)
  runs.set(doc, run)

  return run.gesture(selectionKey(selection.get()), () =>
    selection.subscribe(() => run.select(selectionKey(selection.get())))
  )
}

/**
 * What nudging reads from the frame a selection was picked in, whose viewport and state can lay a design out
 * differently from its base: the flow of the layout around a layer, from its element's parent, and where an absolutely
 * placed layer is drawn in its parent, in steps of `unit` pixels.
 */
export function frameDrawn(
  area: ParentNode,
  design: string,
  picked: { mode?: string; state?: string },
  unit: number
): Drawn {
  const host = selectionFrame(area, design, picked)
  const element = (layer: string) => (host ? findNodeElement(host, layer) : undefined)

  return {
    flow(layer) {
      let parent = element(layer)?.parentElement

      while (parent && getComputedStyle(parent).display === "contents") {
        parent = parent.parentElement
      }

      return parent ? flowOf(getComputedStyle(parent), flowingBoxes(parent)) : undefined
    },
    insets(layer) {
      const insets = host && frameGeometry(host).node(layer)?.insets

      return insets && insetSteps(insets, unit)
    }
  }
}
