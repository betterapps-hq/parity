import { useSyncExternalStore } from "react"

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

export interface Hover {
  design: string
  node?: string
}

/** `interact` hands the pointer and keys to the designs' real components, to try them as in a browser. */
export type Tool = "select" | "hand" | "text" | "interact"

/** Asks whatever shows a design or layer's name to start renaming it in place. */
export interface RenameRequest {
  design: string
  node?: string
  /** Changes with every request, so asking twice for the same thing still starts a rename. */
  id: number
}

/** Selection, hover and the current tool for one tab. The canvas, panels and agents all read and write it. */
export class SelectionStore {
  private selection: Selection = {}
  private hover: Hover | undefined
  private tool: Tool = "select"
  /** Counts the times interacting stopped, so frames can go back to showing the design as it is. */
  private interactions = 0
  /** The node being edited as text, if any. */
  private editing: { design: string; node: string; mode?: string; state?: string } | undefined
  private rename: RenameRequest | undefined
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.selection
  getHover = () => this.hover
  getTool = () => this.tool
  getInteractions = () => this.interactions
  getEditing = () => this.editing
  getRename = () => this.rename

  set(selection: Selection): void {
    if (sameSelection(selection, this.selection)) return
    this.selection = selection
    if (this.editing && (this.editing.node !== selection.node || this.editing.design !== selection.design)) {
      this.editing = undefined
    }
    this.notify()
  }

  setHover(hover: Hover | undefined): void {
    if (hover?.design === this.hover?.design && hover?.node === this.hover?.node) return
    this.hover = hover
    this.notify()
  }

  setTool(tool: Tool): void {
    if (tool === this.tool) return
    if (this.tool === "interact") this.interactions++
    this.tool = tool
    this.notify()
  }

  /** Starts renaming the selected design or layer: the design's title on the canvas, or the layer in the Layers panel. */
  requestRename(): void {
    if (!this.selection.design) return
    this.rename = { design: this.selection.design, node: this.selection.node, id: (this.rename?.id ?? 0) + 1 }
    this.notify()
  }

  setEditing(editing: SelectionStore["editing"]): void {
    this.editing = editing
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function sameSelection(a: Selection, b: Selection): boolean {
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

/** Every selected layer, the one picked last at the end. */
export function selectedNodes(selection: Selection): string[] {
  return selection.nodes ?? (selection.node ? [selection.node] : [])
}

/** Every selected design, when designs rather than layers are selected. */
export function selectedDesigns(selection: Selection): string[] {
  if (selection.node || selection.mode) return []
  return selection.designs ?? (selection.design ? [selection.design] : [])
}

/** A selection of layers in one design, in the frame they were picked in. */
export function layersSelection(
  design: string,
  nodes: string[],
  frame: { mode?: string; state?: string } = {}
): Selection {
  const unique = [...new Set(nodes)]
  if (unique.length === 0) return { design }
  return {
    design,
    node: unique.at(-1),
    ...(unique.length > 1 ? { nodes: unique } : {}),
    ...(frame.mode ? { mode: frame.mode } : {}),
    ...(frame.state ? { state: frame.state } : {})
  }
}

/** Shift-click: adds a layer to the selection, or takes it out when it's already in. */
export function toggleLayer(
  current: Selection,
  design: string,
  node: string,
  frame: { mode?: string; state?: string }
): Selection {
  if (current.design !== design) return layersSelection(design, [node], frame)
  const list = selectedNodes(current)
  const next = list.includes(node) ? list.filter((id) => id !== node) : [...list, node]
  return layersSelection(design, next, { mode: current.mode ?? frame.mode, state: current.state ?? frame.state })
}

/** A selection of designs on the canvas. */
export function designsSelection(designs: string[]): Selection {
  const unique = [...new Set(designs)]
  if (unique.length === 0) return {}
  return { design: unique.at(-1), ...(unique.length > 1 ? { designs: unique } : {}) }
}

export function useSelection(store: SelectionStore): Selection {
  return useSyncExternalStore(store.subscribe, store.get)
}

/**
 * One design's part of the selection: whether it or any of its layers is selected, and the mode column selected on its
 * own, if one is. Read as a plain string, so a board draws again only when its own part changes.
 */
export function useDesignSelection(store: SelectionStore, design: string): { selected: boolean; mode?: string } {
  const part = useSyncExternalStore(store.subscribe, () => {
    const selection = store.get()
    if (selection.design !== design) return ""
    return !selection.node && selection.mode ? `mode:${selection.mode}` : "design"
  })
  return part.startsWith("mode:") ? { selected: true, mode: part.slice("mode:".length) } : { selected: part !== "" }
}

export function useHover(store: SelectionStore): Hover | undefined {
  return useSyncExternalStore(store.subscribe, store.getHover)
}

export function useTool(store: SelectionStore): Tool {
  return useSyncExternalStore(store.subscribe, store.getTool)
}

/** Changes each time interacting stops. */
export function useInteractions(store: SelectionStore): number {
  return useSyncExternalStore(store.subscribe, store.getInteractions)
}

export function useEditing(store: SelectionStore) {
  return useSyncExternalStore(store.subscribe, store.getEditing)
}

export function useRenameRequest(store: SelectionStore): RenameRequest | undefined {
  return useSyncExternalStore(store.subscribe, store.getRename)
}
