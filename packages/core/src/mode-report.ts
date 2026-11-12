import type { DeviceKind } from "./devices.ts"
import { type ContainerSpec, designStates } from "./document.ts"
import {
  defaultWidth,
  type ModeSettings,
  type ModeVariable,
  type ResolvedMode,
  resolveModes,
  shownModes
} from "./modes.ts"
import { frameGeometry, frameViewport } from "./render.ts"

/**
 * A viewport option: its id is what `Responsive(node, viewport, patch)` and a node's `responsive` key take, which isn't
 * a mode id. `height` is the browser window a frame at this width stands for: the device's screen when the option has
 * one, else the screen nearest its width.
 */
export interface ViewportReport {
  id: string
  name: string
  width: number
  height: number
  device?: DeviceKind
}

/**
 * A mode: one option per variable, resolved. Its id is what renders take (`Screenshot`, `find_problems`,
 * `check_accessibility`, a design's main and beside modes). `viewport` names its viewport option.
 */
export interface ModeReport {
  id: string
  name: string
  /** The project's first mode: every design's main frame unless it picks another. */
  primary: boolean
  viewport: string
  width: number
  /** The window height a growing frame in this mode stands for. */
  height: number
  /** The option chosen per variable id, as in `{ viewport: "mobile", theme: "dark", locale: "en" }`. */
  values: Record<string, string>
  /** What the theme and locale do to the frame's body: classes added and attributes set. */
  classNames: string[]
  attributes: Record<string, string>
}

/** A frame a design's board shows: a mode, the frame's size there and the window it stands for. */
export interface FrameReport {
  mode: string
  width: number
  /** Set when the design fixes its height in this viewport, which clips; otherwise the frame grows with content. */
  height?: number
  window: { width: number; height: number }
}

/** What a design's board shows: the state or states, and its main mode and the modes beside it. */
export interface DesignModes {
  id: string
  name: string
  /** The state the board shows, or edits when it shows every state. */
  state: string
  /** The states drawn: just `state`, or all of them when the board shows every state. */
  states: string[]
  main: string
  beside: string[]
  /** Each mode's frame, main first, when asked for. */
  frames?: FrameReport[]
}

export interface ModesReport {
  variables: ModeVariable[]
  viewports: ViewportReport[]
  modes: ModeReport[]
}

/** The project's modes: its variables as set, its viewports with their windows, and each mode resolved. */
export function modesReport(settings: ModeSettings): ModesReport {
  const viewports = settings.variables
    .filter((variable) => variable.kind === "viewport")
    .flatMap((variable) =>
      variable.options.map((option): ViewportReport => {
        const width = option.width ?? defaultWidth
        const window = frameViewport({ width }, { options: [{ variable, option }] })

        const report: ViewportReport = { id: option.id, name: option.name, width, height: window.height }

        if (option.device) {
          report.device = option.device
        }

        return report
      })
    )

  const resolved = resolveModes(settings)

  return {
    variables: structuredClone(settings.variables),
    viewports,
    modes: resolved.map((mode, index) => modeReport(mode, index === 0))
  }
}

function modeReport(mode: ResolvedMode, primary: boolean): ModeReport {
  return {
    id: mode.id,
    name: mode.name,
    primary,
    viewport: mode.viewport,
    width: mode.width,
    height: frameViewport({ width: mode.width }, mode).height,
    values: Object.fromEntries(mode.options.map(({ variable, option }) => [variable.id, option.id])),
    classNames: [...mode.classNames],
    attributes: { ...mode.attributes }
  }
}

/**
 * What a design's board shows, as the canvas draws it: its state (or every state), its main mode and the modes beside
 * it, and, with `frames`, each of those frames' size and window.
 */
export function designModes(settings: ModeSettings, design: ContainerSpec, frames = false): DesignModes {
  const shown = shownModes(settings, design)
  const states = designStates(design)
  const state = design.view?.state ?? states[0]!.id

  const report: DesignModes = {
    id: design.id,
    name: design.name,
    state,
    states: design.view?.allStates ? states.map((each) => each.id) : [state],
    main: shown.main.id,
    beside: shown.beside.map((mode) => mode.id)
  }

  if (frames) {
    report.frames = [shown.main, ...shown.beside].map((mode) => frameReport(design, mode))
  }

  return report
}

function frameReport(design: ContainerSpec, mode: ResolvedMode): FrameReport {
  const { width, height, viewport } = frameGeometry(design, mode)

  // Agents read this as JSON, so `height` keeps its place before `window` when it's there.
  return height === undefined
    ? { mode: mode.id, width, window: viewport }
    : { mode: mode.id, width, height, window: viewport }
}
