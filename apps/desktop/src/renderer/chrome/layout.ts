import { finiteNumber, jsonText } from "@parity-app/core"
import { z } from "zod"
import { recordInterface } from "../interface-events.ts"
import { useStore, windowStore } from "../store.ts"
import type { Attributes } from "./event-attributes.ts"

const storageKey = "parity.layout"
export const panelLimits = { left: [232, 480], right: [260, 520], console: [120, 640] } as const

/** A panel's saved width, or the console's height, kept to its limits. */
const width = (side: keyof typeof panelLimits, fallback: number) =>
  finiteNumber.min(panelLimits[side][0]).max(panelLimits[side][1]).catch(fallback)

/**
 * Which side panels are open and how wide they are, and the console under the canvas (PAR-147). Shared by every tab,
 * and remembered between runs. A saved value that doesn't read falls back to its default without resetting the rest.
 */
const savedLayout = z.object({
  left: z.boolean().catch(true),
  right: z.boolean().catch(true),
  leftWidth: width("left", 256),
  rightWidth: width("right", 320),
  /** The tab each panel has open. */
  leftTab: z.string().optional().catch(undefined),
  rightTab: z.string().optional().catch(undefined),
  console: z.boolean().catch(false),
  consoleHeight: width("console", 240),
  /** The bottom panel's tab: the console, or an extension's log by the extension's id (PAR-1089). */
  bottomTab: z.string().catch("console")
})

export type PanelLayout = z.infer<typeof savedLayout>

/** The panel layout saved as `text`, each value that's missing or doesn't read at its default. */
export function readLayout(text: string | null): PanelLayout {
  return jsonText(savedLayout)
    .catch(() => savedLayout.parse({}))
    .parse(text ?? "{}")
}

/** The layout as it was saved; `resetWindowStores` puts back the defaults, as a first run has them. */
const layout = windowStore(() => readLayout(null))

layout.set(load())

function load(): PanelLayout {
  try {
    return readLayout(localStorage.getItem(storageKey))
  } catch {
    // Storage can be unavailable; the defaults then apply.
    return readLayout(null)
  }
}

export function setLayout(change: Partial<PanelLayout>): void {
  const before = layout.get()
  const after = { ...before, ...change }
  recordShownPanels(before, after)

  try {
    localStorage.setItem(storageKey, JSON.stringify(after))
  } catch {
    // Storage can be unavailable; the layout then just isn't remembered.
  }

  layout.set(after)
}

/** Records each side panel, or the console, that opens or shows another tab (PAR-634). */
function recordShownPanels(before: PanelLayout, after: PanelLayout): void {
  for (const side of ["left", "right"] as const) {
    const tab = after[side === "left" ? "leftTab" : "rightTab"]
    const opened = after[side] && !before[side]
    const switched = after[side] && tab !== before[side === "left" ? "leftTab" : "rightTab"]

    if (opened || switched) {
      const shown: Attributes<"panel.shown"> = { panel: side }

      if (tab) {
        shown.tab = tab
      }

      recordInterface("panel.shown", shown)
    }
  }

  if (after.console && !before.console) {
    recordInterface("panel.shown", { panel: "console" })
  }
}

/** Opens the console under the canvas, or closes it. */
export function toggleConsole(): void {
  setLayout({ console: !layout.get().console })
}

/** Hides both panels, or shows them again, like Figma's Ctrl+\. */
export function togglePanels(): void {
  const { left, right } = layout.get()
  const open = left || right
  setLayout({ left: !open, right: !open })
}

export function useLayout(): PanelLayout {
  return useStore(layout)
}
