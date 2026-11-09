import { type Selection, sameSelection } from "@parity-app/editor"
import { useSyncExternalStore } from "react"
import { recordInterface } from "./interface-events.ts"

export interface Hover {
  design: string
  node?: string
  /** The frame under the pointer, when the layer is hovered on the canvas rather than in Layers. */
  mode?: string
  state?: string
}

/**
 * `frame` draws a frame by dragging on the canvas, and `interact` hands the pointer and keys to the designs' real
 * components, to try them as in a browser.
 */
export type Tool = "select" | "hand" | "frame" | "text" | "interact"

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
  /**
   * The node being edited as text, if any, and where it was double-clicked, in the window's pixels, so the editor opens
   * with that word selected. Without a point it opens with the whole text selected.
   */
  private editing:
    | { design: string; node: string; mode?: string; state?: string; at?: { x: number; y: number } }
    | undefined
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
    if (sameSelection(selection, this.selection)) {
      return
    }

    this.selection = selection

    if (this.editing && (this.editing.node !== selection.node || this.editing.design !== selection.design)) {
      this.editing = undefined
    }

    this.notify()
  }

  setHover(hover: Hover | undefined): void {
    if (
      hover?.design === this.hover?.design &&
      hover?.node === this.hover?.node &&
      hover?.mode === this.hover?.mode &&
      hover?.state === this.hover?.state
    ) {
      return
    }

    this.hover = hover
    this.notify()
  }

  setTool(tool: Tool): void {
    if (tool === this.tool) {
      return
    }

    if (this.tool === "interact") {
      this.interactions++
    }

    if ((tool === "interact") !== (this.tool === "interact")) {
      recordInterface("mode.switched", { mode: tool === "interact" ? "interact" : "design" })
    }

    this.tool = tool
    this.notify()
  }

  /** Starts renaming the selected design or layer: the design's title on the canvas, or the layer in the Layers panel. */
  requestRename(): void {
    if (!this.selection.design) {
      return
    }

    this.rename = { design: this.selection.design, node: this.selection.node, id: (this.rename?.id ?? 0) + 1 }
    this.notify()
  }

  setEditing(editing: SelectionStore["editing"]): void {
    this.editing = editing
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
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

    if (selection.design !== design) {
      return ""
    }

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

/** Whether the designs take the pointer and keys, with the Interact tool. */
export function useInteracting(store: SelectionStore): boolean {
  return useSyncExternalStore(store.subscribe, () => store.getTool() === "interact")
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
