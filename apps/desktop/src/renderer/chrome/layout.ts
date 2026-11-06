import { finiteNumber, jsonText } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import { z } from "zod"

const storageKey = "parity.layout"
export const panelLimits = { left: [232, 480], right: [260, 520] } as const

/** A panel's saved width, kept to its limits. */
const width = (side: keyof typeof panelLimits, fallback: number) =>
  finiteNumber.min(panelLimits[side][0]).max(panelLimits[side][1]).catch(fallback)

/**
 * Which side panels are open and how wide they are. Shared by every tab, and remembered between runs. A saved value
 * that doesn't read falls back to its default without resetting the rest.
 */
const savedLayout = z.object({
  left: z.boolean().catch(true),
  right: z.boolean().catch(true),
  leftWidth: width("left", 256),
  rightWidth: width("right", 320),
  /** The tab each panel has open. */
  leftTab: z.string().optional().catch(undefined),
  rightTab: z.string().optional().catch(undefined)
})

export type PanelLayout = z.infer<typeof savedLayout>

/** The panel layout saved as `text`, each value that's missing or doesn't read at its default. */
export function readLayout(text: string | null): PanelLayout {
  return jsonText(savedLayout)
    .catch(() => savedLayout.parse({}))
    .parse(text ?? "{}")
}

let layout = load()
const listeners = new Set<() => void>()

function load(): PanelLayout {
  try {
    return readLayout(localStorage.getItem(storageKey))
  } catch {
    // Storage can be unavailable; the defaults then apply.
    return readLayout(null)
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
