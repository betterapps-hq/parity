import { besideScale } from "./board.ts"
import type { ContainerSpec, ContainerViewSettings, PreviewSettings } from "./document.ts"
import type { ModeVariable, ResolvedMode } from "./modes.ts"
import { type FrameGeometry, frameGeometry, frameViewport } from "./render.ts"

/*
 * A design's previews on the canvas: each state it shows in each mode it shows. A preview can set its own width, scale
 * and options over its mode's (see `PreviewSettings`), which change how the canvas draws it, never the design.
 */

/** A preview's key in a design's view: its state and its mode, as `default/desktop-light`. */
export function previewKey(state: string, mode: string): string {
  return `${state}/${mode}`
}

/** The state and the mode a preview's key names. */
export interface PreviewAt {
  state: string
  mode: string
}

/** The state and the mode a preview's key names (see `previewKey`). */
export function previewOf(key: string): PreviewAt {
  const at = key.indexOf("/")

  return { state: key.slice(0, at), mode: key.slice(at + 1) }
}

/** One of the values a preview can set over its mode: its width, its scale, or a variable's option, as `option:theme`. */
export type PreviewValue = "width" | "scale" | `option:${string}`

/** What a preview sets over its mode, if anything. */
export function previewSettingsOf(design: ContainerSpec, state: string, mode: string): PreviewSettings | undefined {
  return design.view?.previews?.[previewKey(state, mode)]
}

/** The values a preview sets over its mode, in the order its settings list them. */
export function previewValues(settings: PreviewSettings | undefined): PreviewValue[] {
  if (!settings) {
    return []
  }

  const values: PreviewValue[] = []

  if (settings.width !== undefined) {
    values.push("width")
  }

  if (settings.scale !== undefined) {
    values.push("scale")
  }

  for (const variable of Object.keys(settings.options ?? {})) {
    values.push(`option:${variable}`)
  }

  return values
}

/**
 * A preview's mode on the canvas: its mode with the preview's own options in place of the mode's, so its theme, language or any
 * other variable is drawn as the preview sets it. A viewport option is the mode's: the preview's width stands for it.
 */
export function previewOptionsMode(
  mode: ResolvedMode,
  variables: readonly ModeVariable[],
  settings: PreviewSettings | undefined
): ResolvedMode {
  const own = settings?.options

  if (!own || Object.keys(own).length === 0) {
    return mode
  }

  const options = mode.options.map((chosen) => {
    const id = own[chosen.variable.id]
    const variable = variables.find((each) => each.id === chosen.variable.id) ?? chosen.variable
    const option = chosen.variable.kind === "viewport" ? undefined : variable.options.find((each) => each.id === id)

    return option ? { variable, option } : chosen
  })

  return {
    ...mode,
    classNames: options.flatMap(({ option }) => (option.className ? [option.className] : [])),
    attributes: Object.fromEntries(options.flatMap(({ option }) => Object.entries(option.attributes ?? {}))),
    options
  }
}

/**
 * How a preview's frame is drawn: its mode's frame (see `frameGeometry`), at the preview's own width where it sets one,
 * with the window that width stands for.
 */
export function previewGeometry(
  design: ContainerSpec,
  mode: Pick<ResolvedMode, "viewport" | "width" | "options">,
  settings: PreviewSettings | undefined
): FrameGeometry {
  const frame = frameGeometry(design, mode)

  if (settings?.width === undefined) {
    return frame
  }

  const sized = frame.height === undefined ? { width: settings.width } : { width: settings.width, height: frame.height }

  return { ...sized, viewport: frameViewport(sized, mode) }
}

/**
 * How large a preview is drawn on the canvas: its own scale where it sets one, else its main frame's full size in the
 * first mode shown, and beside it the scale its mode's column has (see `besideScale`).
 */
export function previewScale(
  design: ContainerSpec,
  mode: Pick<ResolvedMode, "id" | "viewport" | "width" | "options">,
  first: boolean,
  settings: PreviewSettings | undefined
): number {
  return settings?.scale ?? (first ? 1 : besideScale(design, mode))
}

/**
 * A design's view with a preview's settings changed: a value given is set, and one given as `undefined` goes back to
 * its mode's. A preview, and the previews, left with nothing set aren't written down.
 */
export function withPreviewValues(
  view: ContainerViewSettings,
  key: string,
  change: { width?: number | undefined; scale?: number | undefined; options?: Record<string, string | undefined> }
): ContainerViewSettings {
  const was = view.previews?.[key] ?? {}
  const next: PreviewSettings = { ...was }

  if ("width" in change) {
    setOrDrop(next, "width", change.width)
  }

  if ("scale" in change) {
    setOrDrop(next, "scale", change.scale)
  }

  if (change.options) {
    const options = { ...next.options }

    for (const [variable, option] of Object.entries(change.options)) {
      if (option === undefined) {
        delete options[variable]
      } else {
        options[variable] = option
      }
    }

    if (Object.keys(options).length === 0) {
      delete next.options
    } else {
      next.options = options
    }
  }

  return withPreview(view, key, next)
}

/** A design's view with a preview back to its mode's values: those given, or every one. */
export function withoutPreviewValues(
  view: ContainerViewSettings,
  key: string,
  values?: readonly PreviewValue[]
): ContainerViewSettings {
  if (!values) {
    return withPreview(view, key, {})
  }

  const options: Record<string, undefined> = {}

  for (const value of values) {
    if (value.startsWith("option:")) {
      options[value.slice("option:".length)] = undefined
    }
  }

  return withPreviewValues(view, key, {
    ...(values.includes("width") && { width: undefined }),
    ...(values.includes("scale") && { scale: undefined }),
    options
  })
}

function setOrDrop(settings: PreviewSettings, field: "width" | "scale", value: number | undefined): void {
  if (value === undefined) {
    delete settings[field]
  } else {
    settings[field] = value
  }
}

function withPreview(view: ContainerViewSettings, key: string, settings: PreviewSettings): ContainerViewSettings {
  const previews = { ...view.previews }

  if (previewValues(settings).length === 0) {
    delete previews[key]
  } else {
    previews[key] = settings
  }

  const next: ContainerViewSettings = { ...view, previews }

  if (Object.keys(previews).length === 0) {
    delete next.previews
  }

  return next
}

/** A width the app's styles respond at, as its tokens or a library name it: `sm` at 640. */
export interface PreviewBreakpoint {
  name: string
  width: number
}

/** The breakpoint a width is at or past, the widest such, or none below the first. Breakpoints are narrowest first. */
export function breakpointAt(breakpoints: readonly PreviewBreakpoint[], width: number): PreviewBreakpoint | undefined {
  return breakpoints.findLast((each) => width >= each.width)
}

/** A width within `reach` of a breakpoint lands on it, so a preview dragged near one is set exactly at it. */
export function snapToBreakpoint(breakpoints: readonly PreviewBreakpoint[], width: number, reach: number): number {
  return breakpoints.find((each) => Math.abs(each.width - width) <= reach)?.width ?? width
}
