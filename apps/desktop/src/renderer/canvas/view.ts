import {
  type ContainerSpec,
  type ContainerViewSettings,
  type ModeSettings,
  type ResolvedMode,
  shownModes,
  type StateSpec
} from "@parity/core"

/** Companion modes are drawn at most this wide, so the main frame stays the focus. */
const companionWidth = 640

export interface ContainerModes {
  /** The main frame's mode. */
  primary: ResolvedMode
  /** Modes this design shows next to its main frame, in project order. */
  companions: ResolvedMode[]
  all: ResolvedMode[]
}

export function containerModes(settings: ModeSettings, container: ContainerSpec): ContainerModes {
  const { main, beside, all } = shownModes(settings, container.view)
  return { primary: main, companions: beside, all }
}

/**
 * Switches the main frame to another mode, without showing more: the mode stops being shown beside it, and the
 * project's primary mode is the default rather than written down.
 */
export function withMainMode(view: ContainerViewSettings, mode: string, all: ResolvedMode[]): ContainerViewSettings {
  const next: ContainerViewSettings = { ...view, modes: (view.modes ?? []).filter((id) => id !== mode) }
  if (mode === all[0]?.id) delete next.mode
  else next.mode = mode
  return next
}

/**
 * Shows these modes on the board: `main` as the large frame, the others beside it in project order. At least the main
 * one shows, and the project's primary mode is the default main rather than written down.
 */
export function withShownModes(
  view: ContainerViewSettings,
  main: string,
  shown: string[],
  all: ResolvedMode[]
): ContainerViewSettings {
  const next: ContainerViewSettings = {
    ...view,
    modes: all.filter((mode) => mode.id !== main && shown.includes(mode.id)).map((mode) => mode.id)
  }
  if (main === all[0]?.id) delete next.mode
  else next.mode = main
  return next
}

/**
 * The board's frames once a mode is checked or unchecked. A board always shows a frame, so the last one stays, and
 * hiding the main frame makes the first of the rest main.
 */
export function toggleShownMode(
  main: string,
  shown: string[],
  mode: string,
  all: ResolvedMode[]
): { main: string; shown: string[] } {
  if (!shown.includes(mode)) return { main, shown: [...shown, mode] }
  const rest = shown.filter((id) => id !== mode)
  if (rest.length === 0) return { main, shown }
  return { main: mode === main ? all.find((candidate) => rest.includes(candidate.id))!.id : main, shown: rest }
}

export function activeState(container: ContainerSpec): StateSpec {
  return container.states.find((state) => state.id === container.view?.state) ?? container.states[0]!
}

/** How much a companion frame of this width is shrunk. */
export function companionScale(width: number): number {
  return Math.min(1, companionWidth / width)
}
