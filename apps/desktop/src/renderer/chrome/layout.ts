import { useSyncExternalStore } from "react"

/** Which side panels are open and how wide they are. Shared by every tab, and remembered between runs. */
export interface PanelLayout {
  left: boolean
  right: boolean
  leftWidth: number
  rightWidth: number
  /** The tab each panel has open. */
  leftTab?: string
  rightTab?: string
}

const storageKey = "parity.layout"
const defaults: PanelLayout = { left: true, right: true, leftWidth: 256, rightWidth: 320 }
export const panelLimits = { left: [200, 480], right: [260, 520] } as const

let layout = load()
const listeners = new Set<() => void>()

function load(): PanelLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Partial<PanelLayout>
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

export function setLayout(change: Partial<PanelLayout>): void {
  layout = { ...layout, ...change }
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // Storage can be unavailable; the layout then just isn't remembered.
  }
  for (const listener of listeners) listener()
}

/** Hides both panels, or shows them again, like Figma's Ctrl+\. */
export function togglePanels(): void {
  const open = layout.left || layout.right
  setLayout({ left: !open, right: !open })
}

export function useLayout(): PanelLayout {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => layout
  )
}
