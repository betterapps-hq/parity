import { useSyncExternalStore } from "react"

/**
 * Picking an element inside a component to see where its code is (PAR-167), as a browser's developer tools pick one:
 * while inspecting, the canvas outlines the element a project file wrote under the pointer, with its file and line,
 * and a click picks it, selecting the layer it's in. The Code section lists the picked layer's elements and shows the
 * picked one's code; hovering one there outlines it on the canvas.
 */
export interface Inspecting {
  /** Whether the canvas is picking, the Code section's Inspect pressed. */
  picking: boolean
  /** The element shown in the Code section, by where it's written (`path:line:column`), in the layer selected. */
  picked?: { node: string; at: string }
  /** The element hovered in the Code section's list, outlined on the canvas. */
  hovered?: { node: string; at: string }
}

let state: Inspecting = { picking: false }
const listeners = new Set<() => void>()

export function getInspecting(): Inspecting {
  return state
}

function update(change: Partial<Inspecting>): void {
  state = { ...state, ...change }

  for (const listener of listeners) {
    listener()
  }
}

/** Starts or stops picking on the canvas. */
export function setPicking(picking: boolean): void {
  if (state.picking !== picking) {
    update({ picking })
  }
}

/** Shows an element of a layer in the Code section, or none. Picking one on the canvas stops picking. */
export function pickElement(picked: Inspecting["picked"]): void {
  update({ picked, picking: false })
}

export function hoverElement(hovered: Inspecting["hovered"]): void {
  if (state.hovered?.at !== hovered?.at || state.hovered?.node !== hovered?.node) {
    update({ hovered })
  }
}

export function useInspecting(): Inspecting {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => state
  )
}
