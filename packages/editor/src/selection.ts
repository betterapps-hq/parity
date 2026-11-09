/**
 * What's selected in a tab, as data: a design on its own, or with layers or one of its modes, several designs, or a
 * free text note. The app keeps the selection in a store and reads it through these; the rules for what an edit to it
 * lands on are in `edit-frame.ts`.
 */

/**
 * What's selected in a tab. A design (by key) is selected on its own, or with one of its nodes or one of its modes.
 * A node selection remembers the frame it was picked in, so outlines can show where the person clicked. Several layers
 * of one design, or several designs, can be selected together; `node` and `design` are then the one picked last.
 */
export interface Selection {
  design?: string
  node?: string
  /** Every selected layer of the design, `node` among them, when there's more than one. */
  nodes?: string[]
  /** Every selected design, `design` among them, when there's more than one and no layer is selected. */
  designs?: string[]
  /** The mode column selected on its own, or the frame a node was picked in. */
  mode?: string
  state?: string
  /** A free text note on the canvas. */
  note?: string
}

/** Whether two selections select the same things, picked the same way. */
export function sameSelection(a: Selection, b: Selection): boolean {
  return (
    a.design === b.design &&
    a.node === b.node &&
    a.mode === b.mode &&
    a.state === b.state &&
    a.note === b.note &&
    sameList(a.nodes, b.nodes) &&
    sameList(a.designs, b.designs)
  )
}

function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
  return a === b || (!!a && !!b && a.length === b.length && a.every((item, index) => item === b[index]))
}

/**
 * What a selection edits, as a key that's the same however it was picked: the design, the layers or designs in it in
 * any order, the frame and state they were picked in, or the note. A run of edits to the selection, such as arrow
 * presses or a number field's Up and Down, lasts while this stays the same.
 */
export function selectionKey(selection: Selection): string {
  return JSON.stringify([
    selection.design,
    selectedNodes(selection).toSorted(),
    (selection.designs ?? []).toSorted(),
    selection.mode,
    selection.state,
    selection.note
  ])
}

/** Every selected layer, the one picked last at the end. */
export function selectedNodes(selection: Selection): string[] {
  return selection.nodes ?? (selection.node ? [selection.node] : [])
}

/** Every selected design, when designs rather than layers are selected. */
export function selectedDesigns(selection: Selection): string[] {
  if (selection.node || selection.mode) {
    return []
  }

  return selection.designs ?? (selection.design ? [selection.design] : [])
}

/** A selection of layers in one design, in the frame they were picked in. */
export function layersSelection(
  design: string,
  nodes: string[],
  frame: { mode?: string; state?: string } = {}
): Selection {
  const unique = [...new Set(nodes)]

  if (unique.length === 0) {
    return { design }
  }

  const selection: Selection = { design, node: unique.at(-1) }

  if (unique.length > 1) {
    selection.nodes = unique
  }

  if (frame.mode) {
    selection.mode = frame.mode
  }

  if (frame.state) {
    selection.state = frame.state
  }

  return selection
}

/** Shift-click: adds a layer to the selection, or takes it out when it's already in. */
export function toggleLayer(
  current: Selection,
  design: string,
  node: string,
  frame: { mode?: string; state?: string }
): Selection {
  if (current.design !== design) {
    return layersSelection(design, [node], frame)
  }

  const list = selectedNodes(current)
  const next = list.includes(node) ? list.filter((id) => id !== node) : [...list, node]

  return layersSelection(design, next, { mode: current.mode ?? frame.mode, state: current.state ?? frame.state })
}

/** A selection of designs on the canvas. */
export function designsSelection(designs: string[]): Selection {
  const unique = [...new Set(designs)]

  if (unique.length === 0) {
    return {}
  }

  const selection: Selection = { design: unique.at(-1) }

  if (unique.length > 1) {
    selection.designs = unique
  }

  return selection
}
