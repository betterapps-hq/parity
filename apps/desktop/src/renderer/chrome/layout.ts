import { finiteNumber } from "@parity-app/core"
import type { SavedLayout } from "@parity-app/lenses"
import type { JsonValue } from "@parity-app/settings"
import { z } from "zod"
import { recordInterface } from "../interface-events.ts"
import { saved, saveState } from "../saved.ts"
import { useStore, windowStore } from "../store.ts"
import type { Attributes } from "./event-attributes.ts"

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
  bottomTab: z.string().catch("console"),
  /**
   * Each project's lens layout by its root, the most recently saved last (PAR-1248). `@parity-app/lenses` reads one as
   * the project opens, so one that doesn't read is the project's alone.
   */
  lenses: z.record(z.string(), z.json()).catch({})
})

export type PanelLayout = z.infer<typeof savedLayout>

/** The panel layout as saved, each value that's missing or doesn't read at its default. */
export function readLayout(value: JsonValue | undefined): PanelLayout {
  return savedLayout.catch(() => savedLayout.parse({})).parse(value ?? {})
}

/** The layout as it was saved; `resetWindowStores` puts back the defaults, as a first run has them. */
const layout = windowStore(() => readLayout(undefined))

// Shared by every copy in `state.json`: a window starts with the layout last saved.
layout.set(readLayout(saved().values.layout))

/** Who hears of a side panel's tab asked for, whether or not it's the one already open. */
const tabListeners = new Set<(side: "left" | "right", tab: string) => void>()

export function setLayout(change: Partial<PanelLayout>): void {
  const before = layout.get()
  const after = { ...before, ...change }
  recordShownPanels(before, after)

  saveState("layout", { ...after })
  layout.set(after)

  for (const [side, tab] of [
    ["left", change.leftTab],
    ["right", change.rightTab]
  ] as const) {
    if (tab !== undefined) {
      for (const listener of tabListeners) {
        listener(side, tab)
      }
    }
  }
}

/**
 * Hears each side panel tab asked for, as Show components or an extension's `showTab` asks, until the returned function
 * is called. A lens whose panel lacks the tab shows one that has it.
 */
export function onTabAsked(listener: (side: "left" | "right", tab: string) => void): () => void {
  tabListeners.add(listener)

  return () => tabListeners.delete(listener)
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

/** How many projects' lens layouts are kept: the ones saved most recently. */
const keptLensLayouts = 50

/** The lens layout `project` saved, by its root, for `@parity-app/lenses` to read. */
export function lensLayoutOf(project: string): JsonValue | undefined {
  return layout.get().lenses[project]
}

/** Saves `project`'s lens layout, for the project to open on next time, unless it's the one saved already. */
export function saveLensLayout(project: string, saved: SavedLayout): void {
  const value = z.json().parse(saved)
  const { lenses } = layout.get()

  if (JSON.stringify(lenses[project]) === JSON.stringify(value)) {
    return
  }

  const others = Object.entries(lenses).filter(([root]) => root !== project)
  setLayout({ lenses: { ...Object.fromEntries(others.slice(1 - keptLensLayouts)), [project]: value } })
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
