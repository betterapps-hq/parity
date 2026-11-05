import { defaultModeSettings, type ResolvedMode, resolveModes, screenHeightForWidth } from "@parity-app/core"

/**
 * The modes of a new project, which the example uses too: Desktop Light (the primary mode), Desktop Dark, Tablet Light
 * and Mobile Light. Resolved as the app resolves them, so the menus and icons are the real ones.
 */
export const modes: readonly ResolvedMode[] = resolveModes(defaultModeSettings)

export function mode(id: string): ResolvedMode {
  const found = modes.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No mode ${id}`)
  return found
}

export const primaryMode = modes[0]!

/** Whether a mode draws the project's dark theme. */
export function isDark(of: ResolvedMode): boolean {
  return of.classNames.includes("dark")
}

/** A size the frame tool offers: one of the project's viewports, and the modes that use it. */
export interface FramePreset {
  /** A mode using the viewport, for its icon. */
  mode: ResolvedMode
  name: string
  width: number
  height: number
  modes: string[]
}

/**
 * The frame tool's sizes: each viewport the modes use, once, in the modes' order. A viewport that gives only a width
 * gets the nearest device's screen height, as boards already estimate a frame they haven't drawn.
 */
export const framePresets: readonly FramePreset[] = modes.reduce<FramePreset[]>((presets, each) => {
  const option = each.options.find(({ variable }) => variable.kind === "viewport")?.option
  const name = option?.name ?? each.name
  const found = presets.find((preset) => preset.name === name)
  if (found) found.modes.push(each.name)
  else {
    presets.push({
      mode: each,
      name,
      width: each.width,
      height: option?.height ?? screenHeightForWidth(each.width),
      modes: [each.name]
    })
  }
  return presets
}, [])
