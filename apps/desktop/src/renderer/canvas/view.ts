import {
  type ContainerSpec,
  type ContainerViewSettings,
  type ModeSettings,
  type ResolvedMode,
  shownModes
} from "@parity-app/core"

export interface ContainerModes {
  /** The main frame's mode. */
  primary: ResolvedMode
  /** Modes this design shows next to its main frame, in its order. */
  companions: ResolvedMode[]
  /** Every mode, in project order: the primary mode first. */
  all: ResolvedMode[]
  /** Every mode in the design's order: the main frame's first. */
  ordered: ResolvedMode[]
}

/** The modes a board shows frames of, by id, and its main one. */
export interface ShownModes {
  main: string
  shown: string[]
}

export function containerModes(settings: ModeSettings, container: ContainerSpec): ContainerModes {
  const { main, beside, all, ordered } = shownModes(settings, container)

  return { primary: main, companions: beside, all, ordered }
}

/**
 * Puts a design's modes in this order: the first is its main frame's, shown whatever else is, and the others are drawn
 * beside it in this order. A main frame's mode that's no longer first still shows, beside the new one. The project's
 * primary mode is the default main rather than written down, and an order that is the project's isn't written down
 * either.
 */
export function withModeOrder(
  view: ContainerViewSettings,
  order: readonly string[],
  all: ResolvedMode[]
): ContainerViewSettings {
  const [main] = order
  const was = view.mode ?? all[0]?.id
  const shown = new Set(view.modes)

  if (was !== undefined) {
    shown.add(was)
  }

  shown.delete(main ?? "")
  const next: ContainerViewSettings = { ...view, modes: [...shown] }

  if (main === undefined || main === all[0]?.id) {
    delete next.mode
  } else {
    next.mode = main
  }

  if (order.every((id, index) => id === all[index]?.id)) {
    delete next.order
  } else {
    next.order = [...order]
  }

  return next
}

/**
 * Switches the main frame to another mode, without showing more: the mode stops being shown beside it, and the
 * project's primary mode is the default rather than written down.
 */
export function withMainMode(view: ContainerViewSettings, mode: string, all: ResolvedMode[]): ContainerViewSettings {
  const next: ContainerViewSettings = { ...view, modes: (view.modes ?? []).filter((id) => id !== mode) }

  if (mode === all[0]?.id) {
    delete next.mode
  } else {
    next.mode = mode
  }

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
    modes: all.flatMap((mode) => (mode.id !== main && shown.includes(mode.id) ? [mode.id] : []))
  }

  if (main === all[0]?.id) {
    delete next.mode
  } else {
    next.mode = main
  }

  return next
}

/**
 * The board's frames once a mode is checked or unchecked. A board always shows a frame, so the last one stays, and
 * hiding the main frame makes the first of the rest main.
 */
export function toggleShownMode(main: string, shown: string[], mode: string, all: ResolvedMode[]): ShownModes {
  if (!shown.includes(mode)) {
    return { main, shown: [...shown, mode] }
  }

  const rest = shown.filter((id) => id !== mode)

  if (rest.length === 0) {
    return { main, shown }
  }

  return { main: mode === main ? all.find((candidate) => rest.includes(candidate.id))!.id : main, shown: rest }
}

/** The modes with these ids, named in project order for a label: "Desktop Light and Mobile Light". */
export function modeNames(all: readonly ResolvedMode[], ids: readonly string[]): string {
  const names = all.flatMap((mode) => (ids.includes(mode.id) ? [mode.name] : []))

  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}
